import type { Prescription } from '../types/session'

/** Fields shared between Prescription and mobility exercises */
interface DoseFields {
  reps: number | null
  seconds: number | null
  notes?: string | null
  repsMax?: number | null
  secondsMax?: number | null
  increment?: number | null
}

/**
 * Format exercise dose for display.
 *
 * Handles reps, seconds, ranges (repsMax/secondsMax), Death By increments,
 * and the PAUSA special case. Works for both regular prescriptions and
 * mobility exercises.
 */
export function formatDose(exercise: DoseFields): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  if (exercise.reps !== null && exercise.reps > 0) {
    if (exercise.increment) {
      const start = exercise.reps
      const inc = exercise.increment
      return `${start} - ${start + inc} - ${start + inc * 2} - ...`
    }
    const repsText = exercise.repsMax
      ? `${exercise.reps} \u00B7 ${exercise.repsMax}`
      : `${exercise.reps}`
    return `${repsText} reps`
  }

  if (exercise.seconds !== null && exercise.seconds > 0) {
    if (exercise.increment) {
      const start = exercise.seconds
      const inc = exercise.increment
      return `${start} - ${start + inc} - ${start + inc * 2} - ...`
    }
    const secsText = exercise.secondsMax
      ? `${exercise.seconds} \u00B7 ${exercise.secondsMax}`
      : `${exercise.seconds}`
    return `${secsText}s`
  }

  return '-'
}

/**
 * Compact dose string for list views.
 * Same logic as formatDose but truncates Death By increments to 2 terms.
 */
export function formatQuickDose(exercise: Prescription): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  if (exercise.reps !== null) {
    if (exercise.increment) {
      return `${exercise.reps} - ${exercise.reps + exercise.increment} - ...`
    }
    const repsText = exercise.repsMax
      ? `${exercise.reps} \u00B7 ${exercise.repsMax}`
      : `${exercise.reps}`
    return `${repsText} reps`
  }

  if (exercise.seconds !== null) {
    if (exercise.increment) {
      return `${exercise.seconds} - ${exercise.seconds + exercise.increment} - ...`
    }
    const secsText = exercise.secondsMax
      ? `${exercise.seconds} \u00B7 ${exercise.secondsMax}`
      : `${exercise.seconds}`
    return `${secsText}s`
  }

  return '-'
}
