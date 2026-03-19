import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createLogger } from 'src/utils/logger'
import { usePersonalizadaApi } from '../composables/usePersonalizadaApi'
import type {
  PersonalizadaDuration,
  PersonalizadaProgress,
  PersonalizadaMetadata,
  PersonalizadaSessionResponse,
} from '../types'

const log = createLogger('PersonalizadaStore')

/**
 * Pinia store for personalizada state management.
 *
 * Tracks active personalizada, selected duration, personalizada metadata,
 * and current session. Uses composition API pattern per project convention.
 */
export const usePersonalizadaStore = defineStore('personalizada', () => {
  // --- State ---

  /** Active personalizada progress for the current member (null if no personalizada selected) */
  const activePersonalizada = ref<PersonalizadaProgress | null>(null)

  /** Selected session duration (20, 40, or 60 minutes) — ephemeral per-session choice */
  const selectedDuration = ref<PersonalizadaDuration | null>(null)

  /** Metadata for all 6 personalizadas (loaded once) */
  const personalizadaMetadata = ref<PersonalizadaMetadata[]>([])

  /** Current personalizada session being played */
  const currentSession = ref<PersonalizadaSessionResponse | null>(null)

  /** Current SPOM week (fetched from session or API) */
  const currentWeek = ref<number>(1)

  /** Loading state for async operations */
  const loading = ref(false)

  /** Last error message */
  const error = ref<string | null>(null)

  // --- Computed ---

  /** Whether the member has an active personalizada */
  const hasActivePersonalizada = computed(() => activePersonalizada.value !== null)

  /** Display name of the active personalizada (null if none) */
  const activePersonalizadaName = computed(() => {
    if (!activePersonalizada.value) return null
    const meta = personalizadaMetadata.value.find(
      (m) => m.type === activePersonalizada.value?.personalizadaType,
    )
    return meta?.name ?? null
  })

  /** Tier of the active personalizada (null if none) */
  const activePersonalizadaTier = computed(() => {
    if (!activePersonalizada.value) return null
    const meta = personalizadaMetadata.value.find(
      (m) => m.type === activePersonalizada.value?.personalizadaType,
    )
    return meta?.tier ?? null
  })

  // --- Actions ---

  /** Fetch personalizada metadata for all 6 personalizadas */
  async function fetchMetadata(): Promise<void> {
    const api = usePersonalizadaApi()
    try {
      loading.value = true
      error.value = null
      personalizadaMetadata.value = await api.getMetadata()
      log.debug('Personalizada metadata loaded', {
        count: personalizadaMetadata.value.length,
      })
    } catch (err: unknown) {
      error.value = 'Error cargando personalizadas'
      log.error('Failed to fetch personalizada metadata', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /** Fetch the member's active personalizada progress */
  async function fetchActivePersonalizada(): Promise<void> {
    const api = usePersonalizadaApi()
    try {
      loading.value = true
      error.value = null
      activePersonalizada.value = await api.getActivePersonalizada()
      log.debug('Active personalizada loaded', {
        personalizadaType: activePersonalizada.value?.personalizadaType ?? 'none',
      })
    } catch (err: unknown) {
      error.value = 'Error cargando tu personalizada'
      log.error('Failed to fetch active personalizada', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
    }
  }

  /** Set the session duration for the current play */
  function setDuration(duration: PersonalizadaDuration): void {
    selectedDuration.value = duration
    log.debug('Duration selected', { duration })
  }

  /** Fetch a personalizada session for a given week/day */
  async function fetchSession(week: number, day: string): Promise<void> {
    if (!selectedDuration.value) {
      log.warn('Cannot fetch session without selecting duration first')
      return
    }
    const api = usePersonalizadaApi()
    try {
      loading.value = true
      error.value = null
      currentSession.value = await api.getSession(week, day, selectedDuration.value)
      log.debug('Personalizada session loaded', {
        dayId: currentSession.value?.dayId ?? 'none',
      })
    } catch (err: unknown) {
      error.value = 'Error cargando sesion'
      log.error('Failed to fetch personalizada session', {
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
   * Complete a personalizada session and update progress.
   * Returns true on success, false on failure.
   */
  async function completePersonalizadaSession(data: {
    dayId: string
    duration: PersonalizadaDuration
    date: string
    startedAt: string
    blocksCompleted: string[]
    rpe: number | null
    notes: string | null
    exercisesCompleted: Record<string, number[]> | null
  }): Promise<boolean> {
    if (!activePersonalizada.value) {
      log.warn('Cannot complete session without active personalizada')
      return false
    }
    const api = usePersonalizadaApi()
    try {
      const result = await api.completeSession({
        dayId: data.dayId,
        personalizadaType: activePersonalizada.value.personalizadaType,
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
        activePersonalizada.value = result.progress
      }
      log.info('Personalizada session completed', {
        dayId: data.dayId,
        duration: data.duration,
      })
      return true
    } catch (err: unknown) {
      log.error('Failed to complete personalizada session', {
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

  /** Reset all personalizada state */
  function reset(): void {
    activePersonalizada.value = null
    selectedDuration.value = null
    personalizadaMetadata.value = []
    currentSession.value = null
    currentWeek.value = 1
    loading.value = false
    error.value = null
  }

  return {
    // State
    activePersonalizada,
    selectedDuration,
    personalizadaMetadata,
    currentSession,
    currentWeek,
    loading,
    error,
    // Computed
    hasActivePersonalizada,
    activePersonalizadaName,
    activePersonalizadaTier,
    // Actions
    fetchMetadata,
    fetchActivePersonalizada,
    setDuration,
    fetchSession,
    completePersonalizadaSession,
    setCurrentWeek,
    clearSession,
    reset,
  }
})
