import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { Notify } from 'quasar'
import { useProgressionStore } from '../stores/progressionStore'
import { extractError } from 'src/utils/extract-error'
import type { ProgressionResponse, WeeklySummary } from '../types'

/**
 * Composable for progression API calls
 *
 * Handles fetching progression stats and submitting evaluation requests.
 * Updates the progression store with fetched data.
 */
export function useProgressionApi() {
  const progressionStore = useProgressionStore()
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch progression stats from API
   *
   * Retrieves member's level, training stats, RPE trends, and evaluation status.
   * Updates the progression store with the response data.
   */
  async function fetchStats(): Promise<void> {
    loading.value = true
    error.value = null
    progressionStore.setLoading(true)

    try {
      const response = await api.get<ProgressionResponse>('/progression/stats')
      progressionStore.setProgressionData(response.data)
    } catch (err: unknown) {
      const errorMessage = extractError(err, 'Error cargando progresión')
      error.value = errorMessage
      progressionStore.setError(errorMessage)

      Notify.create({
        type: 'negative',
        message: errorMessage,
        position: 'top',
      })
    } finally {
      loading.value = false
      progressionStore.setLoading(false)
    }
  }

  /**
   * Submit evaluation request to API
   *
   * Requests a coach evaluation for potential level advancement.
   * Optimistically updates the store to show pending status.
   */
  async function requestEvaluation(): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      await api.post('/progression/request-evaluation')
      progressionStore.setEvaluationPending()

      Notify.create({
        type: 'positive',
        message: 'Solicitud de evaluación enviada',
        position: 'top',
      })

      return true
    } catch (err: unknown) {
      const errorMessage = extractError(err, 'Error al enviar solicitud')
      error.value = errorMessage

      Notify.create({
        type: 'negative',
        message: errorMessage,
        position: 'top',
      })

      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch weekly summary data for Tu Dia
   *
   * Retrieves sessions completed, total minutes, average RPE, and session budget
   * for the current Mon-Sun week. Updates the progression store.
   * Does NOT show a Notify toast on error — card shows inline error instead.
   */
  async function fetchWeeklySummary(): Promise<void> {
    progressionStore.setWeeklySummaryLoading(true)
    progressionStore.setWeeklySummaryError(null)
    try {
      const response = await api.get<WeeklySummary>('/progression/weekly-summary')
      progressionStore.setWeeklySummary(response.data)
    } catch (err: unknown) {
      const errorMessage = extractError(err, 'Error cargando resumen semanal')
      progressionStore.setWeeklySummaryError(errorMessage)
    } finally {
      progressionStore.setWeeklySummaryLoading(false)
    }
  }

  return {
    fetchStats,
    requestEvaluation,
    fetchWeeklySummary,
    loading,
    error,
  }
}
