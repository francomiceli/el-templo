import { api } from 'src/boot/axios'

/**
 * Clase pendiente de puntuar. Privacy-preserving (D-A3): el payload describe
 * SOLO la clase (actividad/día), nunca identidad del profe (ni nombre ni foto).
 * El server (Plan 02) ya aplica las reglas de 48h/última/sin-profe/one-shot.
 */
export interface PendingRating {
  sessionDate: string
  branchId: number
  scheduleId: number
  activityName: string
  dayOfWeek: number
}

export interface SubmitRatingInput {
  sessionDate: string
  scheduleId: number
  stars: number
  comment?: string
}

export function useRatingsApi() {
  /**
   * Devuelve la última clase elegible para puntuar, o `null` si no hay ninguna.
   * Toda la lógica de elegibilidad vive server-side.
   */
  async function getPendingRating(): Promise<PendingRating | null> {
    const response = await api.get<PendingRating | null>('/members/ratings/pending')
    return response.data
  }

  async function submitRating(input: SubmitRatingInput): Promise<void> {
    await api.post('/members/ratings', input)
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { getPendingRating, submitRating, cleanup }
}
