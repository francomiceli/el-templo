import { ref, type Ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { isExpectedClientError } from 'src/utils/extract-error'

const log = createLogger('ExerciseAdjustment')

/** Direction of the in-session adjustment (D-02). */
export type AdjustDirection = 'up' | 'down'

/** Neighbor exercise served by the tree (Plan 01 contract). */
export interface AdjustmentNeighbor {
  id: number
  name: string
  dificultadLineal: number
  contraction: string
  position: string | null
}

/** Response from POST /api/exercise-adjustments (Plan 01 contract). */
export interface AdjustmentResponse {
  /** Resolved neighbor, or null at the chain end / off-graph. */
  neighbor: AdjustmentNeighbor | null
  /** Non-null only when neighbor is null (e.g. "ya estás en el extremo de la cadena"). */
  message: string | null
}

export interface ExerciseAdjustmentReturn {
  /** Whether an adjustment request is in flight. */
  isSubmitting: Ref<boolean>
  /**
   * Request a one-step difficulty adjustment for an exercise.
   *
   * @param exerciseId - Origin exercise (tree node) the member tapped.
   * @param direction - "up" (más difícil → dominado) / "down" (más fácil → bajado).
   * @param dayId - Session reference (e.g. "W1-lunes-sigma").
   * @param date - Session date (YYYY-MM-DD).
   * @returns The `{ neighbor, message }` payload, or null on transport/server failure.
   */
  adjustExercise: (
    exerciseId: number,
    direction: AdjustDirection,
    dayId: string,
    date: string,
  ) => Promise<AdjustmentResponse | null>
  /** No-op cleanup to satisfy the composable contract (no timers/listeners held). */
  cleanup: () => void
}

/**
 * Composable for the in-session difficulty adjustment.
 *
 * Calls the Plan 01 member-scoped endpoint, which persists the dominado/bajado
 * record and resolves the one-step tree neighbor. The visual swap (replacing
 * only the exercise identity in the local session block) is applied by the
 * caller with the returned neighbor — this composable never mutates session
 * state or touches the member's level/SPOM.
 */
export function useExerciseAdjustment(): ExerciseAdjustmentReturn {
  const isSubmitting = ref(false)

  async function adjustExercise(
    exerciseId: number,
    direction: AdjustDirection,
    dayId: string,
    date: string,
  ): Promise<AdjustmentResponse | null> {
    if (isSubmitting.value) return null
    isSubmitting.value = true

    try {
      // api already prefixes /api
      const response = await api.post<AdjustmentResponse>('/exercise-adjustments', {
        exerciseId,
        direction,
        dayId,
        date,
      })
      return response.data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to adjust exercise'
      if (isExpectedClientError(err)) {
        log.warn('Exercise adjustment rejected by server', { error: message })
      } else {
        log.error('Exercise adjustment failed', { error: message })
      }
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  function cleanup(): void {
    // No timers or listeners to release — present to honor the composable contract.
  }

  return {
    isSubmitting,
    adjustExercise,
    cleanup,
  }
}
