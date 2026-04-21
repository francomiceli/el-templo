import { ref, type Ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { isExpectedClientError } from 'src/utils/extract-error'

const log = createLogger('SessionCompletion')

export interface CompletionData {
  dayId: string
  date: string
  startedAt: string
  rpe: number | null
  notes: string | null
  blocksCompleted: string[]
  exercisesCompleted?: Record<string, number[]>
}

export interface CompletionResponse {
  success: boolean
  completedSessionId: number
  totalDaysTrained: number
}

export interface SessionCompletionReturn {
  /** Whether API call is in progress */
  isSubmitting: Ref<boolean>
  /** Total days trained (populated after API call) */
  totalDaysTrained: Ref<number>
  /** Error message if submission failed */
  error: Ref<string | null>
  /** Submit completion to API */
  completeSession: (data: CompletionData) => Promise<CompletionResponse | null>
}

/**
 * Composable for session completion logic
 */
export function useSessionCompletion(): SessionCompletionReturn {
  const isSubmitting = ref(false)
  const totalDaysTrained = ref(0)
  const error = ref<string | null>(null)

  /**
   * Submit completion data to API
   */
  async function completeSession(data: CompletionData): Promise<CompletionResponse | null> {
    isSubmitting.value = true
    error.value = null

    try {
      const response = await api.post<CompletionResponse>('/sessions/complete', {
        dayId: data.dayId,
        date: data.date,
        startedAt: data.startedAt,
        rpe: data.rpe,
        notes: data.notes,
        blocksCompleted: data.blocksCompleted,
        exercisesCompleted: data.exercisesCompleted ?? null,
      })

      totalDaysTrained.value = response.data.totalDaysTrained
      return response.data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete session'
      error.value = message
      if (isExpectedClientError(err)) {
        log.warn('Session completion rejected by server', { error: message })
      } else {
        log.error('Session completion failed', { error: message })
      }
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  return {
    isSubmitting,
    totalDaysTrained,
    error,
    completeSession,
  }
}
