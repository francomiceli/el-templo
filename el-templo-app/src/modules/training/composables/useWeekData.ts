import { ref } from 'vue';
import axios from 'axios';
import type { Session } from '../types/session';
import { isSunday } from './useDateNavigation';

/**
 * Composable for fetching week session data from API
 *
 * Handles parallel fetching of sessions for all 7 days of the week,
 * with proper error handling and Sunday skipping.
 */

interface UseWeekDataReturn {
  sessions: Map<string, Session | null>;
  loading: boolean;
  error: string | null;
  fetchWeekSessions: (dates: string[]) => Promise<void>;
}

/**
 * Fetch session data for a week of dates
 *
 * API endpoint: GET /api/sessions/daily?date=YYYY-MM-DD
 *
 * Behavior:
 * - Skips Sundays entirely (API returns 400 for domingo)
 * - Uses Promise.all for parallel fetching
 * - Gracefully handles individual fetch failures (sets session to null)
 * - Returns Map of date -> Session|null
 *
 * @example
 * const { sessions, loading, error, fetchWeekSessions } = useWeekData();
 * await fetchWeekSessions(['2026-01-20', '2026-01-21', ...]);
 */
export function useWeekData(): UseWeekDataReturn {
  const sessions = ref(new Map<string, Session | null>());
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Fetch sessions for multiple dates in parallel
   *
   * @param dates - Array of date strings in YYYY-MM-DD format
   */
  async function fetchWeekSessions(dates: string[]): Promise<void> {
    loading.value = true;
    error.value = null;
    sessions.value.clear();

    try {
      // Create fetch promises for all non-Sunday dates
      const fetchPromises = dates.map(async (date) => {
        // Skip Sundays - they're rest days
        if (isSunday(date)) {
          return { date, session: null };
        }

        try {
          const response = await axios.get<Session>('/api/sessions/daily', {
            params: { date },
          });
          return { date, session: response.data };
        } catch (err: unknown) {
          // Gracefully handle individual fetch failures
          // Log error but don't throw - allow other fetches to complete
          const axiosError = err as { response?: { status?: number; data?: { error?: string } } };
          console.warn(`Failed to fetch session for ${date}:`, axiosError.response?.data?.error || 'Unknown error');
          return { date, session: null };
        }
      });

      // Wait for all fetches to complete
      const results = await Promise.all(fetchPromises);

      // Build sessions map
      const newSessions = new Map<string, Session | null>();
      results.forEach(({ date, session }) => {
        newSessions.set(date, session);
      });

      sessions.value = newSessions;
    } catch (err: unknown) {
      // This catch handles unexpected errors in the overall fetch logic
      const axiosError = err as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error || 'Error fetching week sessions';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    sessions: sessions.value,
    loading: loading.value,
    error: error.value,
    fetchWeekSessions,
  };
}
