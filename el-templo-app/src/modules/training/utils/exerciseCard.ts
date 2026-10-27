/**
 * Piezas puras de la card de ejercicio del player (lista compacta, sketch 025 B): el estado visual
 * de la card y el desarme de la dosis para la placa oscura de la derecha. Sin Vue, así se testean
 * sin montar nada.
 */

export type ExerciseCardState = 'now' | 'done' | 'idle'

/**
 * Estado visual de una card. Tildado gana sobre "de ahora": el ejercicio que se acaba de completar
 * sigue siendo el activo hasta que la historia avanza, pero ya se ve verde y sin la etiqueta AHORA.
 */
export function exerciseCardState(isActive: boolean, isCompleted: boolean): ExerciseCardState {
  if (isCompleted) return 'done'
  return isActive ? 'now' : 'idle'
}

const UNIT_SUFFIX = /\s+(REPS|SEG)$/

/** Marca de segundos de la placa (doble prima: 30″). */
export const SECONDS_MARK = '″'

/**
 * Lo que va en la placa oscura de la derecha, a partir de la dosis compacta ("8 REPS", "30 SEG",
 * "10 · 12 REPS", "8 - 10 - ...", "PAUSA"): solo el número, como en la TV. Las repeticiones van sin
 * unidad y los segundos con ″ (Franco, 2026-10-23).
 */
export function plateValue(quickDose: string): string {
  const text = quickDose.trim()
  const match = UNIT_SUFFIX.exec(text)
  if (!match) return text
  const value = text.slice(0, match.index)
  return match[1] === 'SEG' ? `${value}${SECONDS_MARK}` : value
}
