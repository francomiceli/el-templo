import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createLogger } from 'src/utils/logger'
import { useJourneyApi } from '../composables/useJourneyApi'
import type {
  JourneyType,
  JourneyDuration,
  JourneyProgress,
  JourneyMetadata,
  JourneySessionResponse,
} from '../types'

const log = createLogger('JourneyStore')

/**
 * Pinia store for journey state management.
 *
 * Tracks active journey, selected duration, journey metadata,
 * and current session. Uses composition API pattern per project convention.
 */
export const useJourneyStore = defineStore('journey', () => {
  // --- State ---

  /** Active journey progress for the current member (null if no journey selected) */
  const activeJourney = ref<JourneyProgress | null>(null)

  /** Selected session duration (20, 40, or 60 minutes) — ephemeral per-session choice */
  const selectedDuration = ref<JourneyDuration | null>(null)

  /** Metadata for all 6 journeys (loaded once) */
  const journeyMetadata = ref<JourneyMetadata[]>([])

  /** Current journey session being played */
  const currentSession = ref<JourneySessionResponse | null>(null)

  /** Current SPOM week (fetched from session or API) */
  const currentWeek = ref<number>(1)

  /** Loading state for async operations */
  const loading = ref(false)

  /** Last error message */
  const error = ref<string | null>(null)

  // --- Computed ---

  /** Whether the member has an active journey */
  const hasActiveJourney = computed(() => activeJourney.value !== null)

  /** Display name of the active journey (null if none) */
  const activeJourneyName = computed(() => {
    if (!activeJourney.value) return null
    const meta = journeyMetadata.value.find((m) => m.type === activeJourney.value?.journeyType)
    return meta?.name ?? null
  })

  /** Tier of the active journey (null if none) */
  const activeJourneyTier = computed(() => {
    if (!activeJourney.value) return null
    const meta = journeyMetadata.value.find((m) => m.type === activeJourney.value?.journeyType)
    return meta?.tier ?? null
  })

  // --- Actions ---

  /** Fetch journey metadata for all 6 journeys */
  async function fetchMetadata(): Promise<void> {
    const api = useJourneyApi()
    try {
      loading.value = true
      error.value = null
      journeyMetadata.value = await api.getMetadata()
      log.debug('Journey metadata loaded', {
        count: journeyMetadata.value.length,
      })
    } catch (err: unknown) {
      error.value = 'Error cargando journeys'
      log.error('Failed to fetch journey metadata', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /** Fetch the member's active journey progress */
  async function fetchActiveJourney(): Promise<void> {
    const api = useJourneyApi()
    try {
      loading.value = true
      error.value = null
      activeJourney.value = await api.getActiveJourney()
      log.debug('Active journey loaded', {
        journeyType: activeJourney.value?.journeyType ?? 'none',
      })
    } catch (err: unknown) {
      error.value = 'Error cargando tu journey'
      log.error('Failed to fetch active journey', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /** Select a new journey (archives current if any) */
  async function selectJourney(type: JourneyType): Promise<void> {
    const api = useJourneyApi()
    try {
      loading.value = true
      error.value = null
      activeJourney.value = await api.selectJourney(type)
      log.info('Journey selected', { journeyType: type })
    } catch (err: unknown) {
      error.value = 'Error seleccionando journey'
      log.error('Failed to select journey', {
        error: err instanceof Error ? err.message : String(err),
        journeyType: type,
      })
      throw err
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /** Set the session duration for the current play */
  function setDuration(duration: JourneyDuration): void {
    selectedDuration.value = duration
    log.debug('Duration selected', { duration })
  }

  /** Fetch a journey session for a given week/day */
  async function fetchSession(week: number, day: string): Promise<void> {
    if (!selectedDuration.value) {
      log.warn('Cannot fetch session without selecting duration first')
      return
    }
    const api = useJourneyApi()
    try {
      loading.value = true
      error.value = null
      currentSession.value = await api.getSession(week, day, selectedDuration.value)
      log.debug('Journey session loaded', {
        dayId: currentSession.value?.dayId ?? 'none',
      })
    } catch (err: unknown) {
      error.value = 'Error cargando sesion'
      log.error('Failed to fetch journey session', {
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
   * Complete a journey session and update progress.
   * Returns true on success, false on failure.
   */
  async function completeJourneySession(data: {
    dayId: string
    duration: JourneyDuration
    date: string
    startedAt: string
    blocksCompleted: string[]
    rpe: number | null
    notes: string | null
    exercisesCompleted: Record<string, number[]> | null
  }): Promise<boolean> {
    if (!activeJourney.value) {
      log.warn('Cannot complete session without active journey')
      return false
    }
    const api = useJourneyApi()
    try {
      const result = await api.completeSession({
        dayId: data.dayId,
        journeyType: activeJourney.value.journeyType,
        duration: data.duration,
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
        activeJourney.value = result.progress
      }
      log.info('Journey session completed', {
        dayId: data.dayId,
        duration: data.duration,
      })
      return true
    } catch (err: unknown) {
      log.error('Failed to complete journey session', {
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
    selectedDuration.value = null
  }

  /** Reset all journey state */
  function reset(): void {
    activeJourney.value = null
    selectedDuration.value = null
    journeyMetadata.value = []
    currentSession.value = null
    currentWeek.value = 1
    loading.value = false
    error.value = null
  }

  return {
    // State
    activeJourney,
    selectedDuration,
    journeyMetadata,
    currentSession,
    currentWeek,
    loading,
    error,
    // Computed
    hasActiveJourney,
    activeJourneyName,
    activeJourneyTier,
    // Actions
    fetchMetadata,
    fetchActiveJourney,
    selectJourney,
    setDuration,
    fetchSession,
    completeJourneySession,
    setCurrentWeek,
    clearSession,
    reset,
  }
})
