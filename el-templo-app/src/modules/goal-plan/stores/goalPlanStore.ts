import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createLogger } from 'src/utils/logger'
import { useGoalPlanApi } from '../composables/useGoalPlanApi'
import type {
  GoalPlanProgress,
  GoalPlanMetadata,
  GoalPlanSessionResponse,
} from '../types'

const log = createLogger('GoalPlanStore')

/**
 * Pinia store for goal plan state management.
 *
 * Tracks active goal plan, goal plan metadata,
 * and current session. Uses composition API pattern per project convention.
 */
export const useGoalPlanStore = defineStore('goalPlan', () => {
  // --- State ---

  /** Active goal plan progress for the current member (null if no goal plan selected) */
  const activeGoalPlan = ref<GoalPlanProgress | null>(null)

  /** Metadata for all 6 goal plans (loaded once) */
  const goalPlanMetadata = ref<GoalPlanMetadata[]>([])

  /** Current goal plan session being played */
  const currentSession = ref<GoalPlanSessionResponse | null>(null)

  /** Current SPOM week (fetched from session or API) */
  const currentWeek = ref<number>(1)

  /** Loading state for async operations */
  const loading = ref(false)

  /** Last error message */
  const error = ref<string | null>(null)

  // --- Computed ---

  /** Whether the member has an active goal plan */
  const hasActiveGoalPlan = computed(() => activeGoalPlan.value !== null)

  /** Display name of the active goal plan (null if none) */
  const activeGoalPlanName = computed(() => {
    if (!activeGoalPlan.value) return null
    const meta = goalPlanMetadata.value.find(
      (m) => m.type === activeGoalPlan.value?.goalPlanType,
    )
    return meta?.name ?? null
  })

  /** Tier of the active goal plan (null if none) */
  const activeGoalPlanTier = computed(() => {
    if (!activeGoalPlan.value) return null
    const meta = goalPlanMetadata.value.find(
      (m) => m.type === activeGoalPlan.value?.goalPlanType,
    )
    return meta?.tier ?? null
  })

  // --- Actions ---

  /** Fetch goal plan metadata for all 6 goal plans */
  async function fetchMetadata(): Promise<void> {
    const api = useGoalPlanApi()
    try {
      loading.value = true
      error.value = null
      goalPlanMetadata.value = await api.getMetadata()
      log.debug('Goal plan metadata loaded', {
        count: goalPlanMetadata.value.length,
      })
    } catch (err: unknown) {
      error.value = 'Error cargando planes por objetivos'
      log.error('Failed to fetch goal plan metadata', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /** Fetch the member's active goal plan progress */
  async function fetchActiveGoalPlan(): Promise<void> {
    const api = useGoalPlanApi()
    try {
      loading.value = true
      error.value = null
      activeGoalPlan.value = await api.getActiveGoalPlan()
      log.debug('Active goal plan loaded', {
        goalPlanType: activeGoalPlan.value?.goalPlanType ?? 'none',
      })
    } catch (err: unknown) {
      error.value = 'Error cargando tu plan por objetivos'
      log.error('Failed to fetch active goal plan', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /** Fetch a goal plan session for a given week/day */
  async function fetchSession(week: number, day: string): Promise<void> {
    const api = useGoalPlanApi()
    try {
      loading.value = true
      error.value = null
      currentSession.value = await api.getSession(week, day)
      log.debug('Goal plan session loaded', {
        dayId: currentSession.value?.dayId ?? 'none',
      })
    } catch (err: unknown) {
      error.value = 'Error cargando sesion'
      log.error('Failed to fetch goal plan session', {
        error: err instanceof Error ? err.message : String(err),
        week,
        day,
      })
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /**
   * Complete a goal plan session and update progress.
   * Returns true on success, false on failure.
   */
  async function completeGoalPlanSession(data: {
    dayId: string
    date: string
    startedAt: string
    blocksCompleted: string[]
    rpe: number | null
    notes: string | null
    exercisesCompleted: Record<string, number[]> | null
  }): Promise<boolean> {
    if (!activeGoalPlan.value) {
      log.warn('Cannot complete session without active goal plan')
      return false
    }
    const api = useGoalPlanApi()
    try {
      const result = await api.completeSession({
        dayId: data.dayId,
        goalPlanType: activeGoalPlan.value.goalPlanType,
        date: data.date,
        startedAt: data.startedAt,
        finishedAt: new Date().toISOString(),
        blocksCompleted: data.blocksCompleted,
        rpe: data.rpe,
        notes: data.notes,
        exercisesCompleted: data.exercisesCompleted,
      })
      // Update progress from API response
      if (result.progress) {
        activeGoalPlan.value = result.progress
      }
      log.info('Goal plan session completed', {
        dayId: data.dayId,
      })
      return true
    } catch (err: unknown) {
      log.error('Failed to complete goal plan session', {
        error: err instanceof Error ? err.message : String(err),
        dayId: data.dayId,
      })
      return false
    } finally {
      api.cleanup()
    }
  }

  /** Set current week from session data */
  function setCurrentWeek(week: number): void {
    currentWeek.value = week
  }

  /** Clear the current session data */
  function clearSession(): void {
    currentSession.value = null
  }

  /** Reset all goal plan state */
  function reset(): void {
    activeGoalPlan.value = null
    goalPlanMetadata.value = []
    currentSession.value = null
    currentWeek.value = 1
    loading.value = false
    error.value = null
  }

  return {
    // State
    activeGoalPlan,
    goalPlanMetadata,
    currentSession,
    currentWeek,
    loading,
    error,
    // Computed
    hasActiveGoalPlan,
    activeGoalPlanName,
    activeGoalPlanTier,
    // Actions
    fetchMetadata,
    fetchActiveGoalPlan,
    fetchSession,
    completeGoalPlanSession,
    setCurrentWeek,
    clearSession,
    reset,
  }
})
