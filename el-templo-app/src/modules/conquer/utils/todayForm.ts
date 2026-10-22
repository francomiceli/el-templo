import type { ComboEntry, SaveSessionBody, StepKey, TodayResponse, Unit } from '../types'

// Fase 201 §7.1 Hoy, D-18: formulario puro de la pantalla Hoy. El app NO recalcula el motor: los
// valores precargados son los que manda `GET /today` (objetivo, o lo guardado si ya hay sesión).

/** Valores de los 4 escalones de un ejercicio. */
export type StepValues = Record<StepKey, number>

export interface TodayForm {
  /** Molestia articular 0-10. */
  pain: number
  /** Por `exerciseId`. */
  values: Record<number, StepValues>
  /** Combo de apertura de Toro: peldaño de arranque y series; `null` si el día no lo trae. */
  opening: ComboEntry | null
}

/** Arma el formulario con los valores que mandó el API (D-18: guardar sin tocar = cumplido). */
export function buildTodayForm(today: TodayResponse): TodayForm {
  const values: Record<number, StepValues> = {}
  for (const exercise of today.exercises) {
    const row: StepValues = { e1: 0, e2: 0, e3: 0, hold: 0 }
    for (const step of exercise.steps) row[step.step] = step.value
    values[exercise.exerciseId] = row
  }
  return {
    pain: today.pain,
    values,
    opening: today.opening ? { rungId: today.opening.rungId, series: today.opening.value } : null,
  }
}

/**
 * Tope del contador de un escalón: 100 en E1-E3 de los ejercicios de repeticiones; 600 en los
 * de segundos y en el hold final (siempre segundos). Son los mismos topes que valida el API.
 */
export function counterMax(unit: Unit, step: StepKey): number {
  if (step === 'hold') return 600
  return unit === 'reps' ? 100 : 600
}

/** Body de `PUT /sessions`. El `opening` va solo si el día trae combo de apertura. */
export function toSaveBody(today: TodayResponse, form: TodayForm): SaveSessionBody {
  const body: SaveSessionBody = {
    dayKey: today.dayKey,
    pain: form.pain,
    exercises: today.exercises.map((exercise) => {
      const row = form.values[exercise.exerciseId]
      return {
        exerciseId: exercise.exerciseId,
        e1: row.e1,
        e2: row.e2,
        e3: row.e3,
        hold: row.hold,
      }
    }),
  }
  if (today.opening) {
    body.opening = form.opening ?? { rungId: today.opening.rungId, series: today.opening.value }
  }
  return body
}

/** Columnas del templo que se llenan: cuántos de E1-E3 tienen una marca mayor que 0. */
export function templeFilled(values: StepValues): 0 | 1 | 2 | 3 {
  const count = [values.e1, values.e2, values.e3].filter((v) => v > 0).length
  return count as 0 | 1 | 2 | 3
}
