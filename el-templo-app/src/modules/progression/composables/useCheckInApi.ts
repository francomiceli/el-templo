import { api } from 'src/boot/axios'
import { extractError } from 'src/utils/extract-error'
import { createLogger } from 'src/utils/logger'
import { useProgressionStore } from '../stores/progressionStore'
import type { CheckInQuestionType, TodayCheckInState } from '../types'

const log = createLogger('CheckInApi')

/**
 * Composable for check-in API calls
 *
 * Handles fetching today's check-in state and submitting answers.
 * Updates the progression store with check-in data.
 */
export function useCheckInApi() {
  const progressionStore = useProgressionStore()

  /**
   * Fetch today's check-in state from API
   *
   * Retrieves any answers already given today.
   * Updates the progression store with the response data.
   */
  async function fetchTodayCheckIns(): Promise<void> {
    progressionStore.setCheckInLoading(true)
    try {
      const response = await api.get<TodayCheckInState>('/check-ins/today')
      progressionStore.setCheckInState(response.data)
    } catch (err: unknown) {
      const errorMessage = extractError(err, 'Error cargando check-ins')
      progressionStore.setCheckInError(errorMessage)
    } finally {
      progressionStore.setCheckInLoading(false)
    }
  }

  /**
   * Submit a check-in answer
   *
   * Posts the answer to the API and optimistically updates the store.
   * Returns true on success, false on failure (no toast — card handles inline).
   */
  async function submitCheckIn(
    questionType: CheckInQuestionType,
    value: string,
    bodyArea?: string,
  ): Promise<boolean> {
    try {
      await api.post('/check-ins', {
        questionType,
        value,
        bodyArea: bodyArea || undefined,
      })
      // Optimistic update: mark this question as answered in store
      progressionStore.setCheckInAnswer(questionType, {
        value,
        bodyArea: bodyArea || null,
      })
      return true
    } catch (err: unknown) {
      const errorMessage = extractError(err, 'Error al enviar respuesta')
      log.error('Check-in submit failed', { questionType, value, errorMessage })
      return false
    }
  }

  return { fetchTodayCheckIns, submitCheckIn }
}
