import { ref, type Ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import { useUserStore } from 'src/stores/useUserStore'
import type { Session } from '../types/session'

const log = createLogger('WeekData')

/**
 * Composable for fetching week session data from API
 *
 * Fetches all sessions for a week in a single API call.
 */

interface UseWeekDataReturn {
  sessions: Ref<Map<string, Session | null>>
  completedDates: Ref<string[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchWeekSessions: (dates: string[]) => Promise<void>
}

interface WeeklyResponse {
  sessions: Record<string, Session | null>
  completedDates?: string[]
  view?: 'templo' | 'program'
}

/**
 * Fetch session data for a week of dates
 *
 * API endpoint: GET /api/sessions/weekly?weekStart=YYYY-MM-DD
 *
 * Behavior:
 * - Single API call for all 7 days
 * - Sundays return null (rest days)
 * - Returns Map of date -> Session|null
 *
 * @example
 * const { sessions, loading, error, fetchWeekSessions } = useWeekData();
 * await fetchWeekSessions(['2026-01-20', '2026-01-21', ...]);
 */
export function useWeekData(): UseWeekDataReturn {
  const userStore = useUserStore()
  const sessions = ref(new Map<string, Session | null>())
  const completedDates = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch sessions for a week starting from the first date
   *
   * @param dates - Array of date strings in YYYY-MM-DD format (first should be Monday)
   */
  async function fetchWeekSessions(dates: string[]): Promise<void> {
    loading.value = true
    error.value = null
    sessions.value.clear()

    try {
      // Use the first date (Monday) as week start
      const weekStart = dates[0]

      const params: Record<string, string> = {}
      if (weekStart) params.weekStart = weekStart
      if (userStore.selectedLevel) params.level = userStore.selectedLevel

      // Phase 104 (checker BLOCKER #1 fix): only set params.view when we can
      // confidently determine it client-side. For an online-only user with
      // currentProgramEnrollmentId === null but active enrollments (the
      // default state right after migration 0105), let the server resolve
      // the default by OMITTING the param — sending view='program' here
      // would 404 because the user has no current program selected.
      //
      // Decision matrix:
      //   enrollmentId !== null              → view='program'
      //   enrollmentId === null + presencial → view='templo'
      //   enrollmentId === null, no presencial, has enrollments → OMIT
      //   no plan, no enrollment → unreachable (TrainingIndex blocks)
      const enrollmentId = userStore.currentProgram.enrollmentId
      const hasPresencial = userStore.hasPresencialPlan
      const enrollmentsCount = userStore.allActiveEnrollments.length

      if (enrollmentId !== null) {
        params.view = 'program'
      } else if (hasPresencial) {
        params.view = 'templo'
      } else if (enrollmentsCount > 0) {
        // Online-only user, no pointer — server picks first enrollment.
        // Do NOT set params.view (omitting yields no `view=` in query string).
      } else {
        // No plan, no enrollment — TrainingIndex blocks upstream; we should
        // not reach this branch. Leave params.view unset for safety.
      }

      const response = await api.get<WeeklyResponse>('/sessions/weekly', {
        params,
      })

      // Build sessions map from response
      const newSessions = new Map<string, Session | null>()
      for (const [date, session] of Object.entries(response.data.sessions)) {
        newSessions.set(date, session)
      }

      sessions.value = newSessions
      completedDates.value = response.data.completedDates ?? []
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando semana')
      log.error('Failed to fetch week sessions', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
    }
  }

  return {
    sessions,
    completedDates,
    loading,
    error,
    fetchWeekSessions,
  }
}
