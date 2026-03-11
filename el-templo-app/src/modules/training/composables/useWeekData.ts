import { ref, type Ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import type { Session } from '../types/session'

const log = createLogger('WeekData')

/**
 * Composable for fetching week session data from API
 *
 * Fetches all sessions for a week in a single API call.
 */

interface UseWeekDataReturn {
  sessions: Ref<Map<string, Session | null>>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchWeekSessions: (dates: string[]) => Promise<void>
}

interface WeeklyResponse {
  sessions: Record<string, Session | null>
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
  const sessions = ref(new Map<string, Session | null>())
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

      const response = await api.get<WeeklyResponse>('/sessions/weekly', {
        params: { weekStart },
      })

      // Build sessions map from response
      const newSessions = new Map<string, Session | null>()
      for (const [date, session] of Object.entries(response.data.sessions)) {
        newSessions.set(date, session)
      }

      sessions.value = newSessions
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
    loading,
    error,
    fetchWeekSessions,
  }
}
