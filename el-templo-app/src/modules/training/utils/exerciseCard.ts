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

export interface DosePlate {
  /** Lo grande de la placa ("8", "10 · 12", "10-12-10", "PAUSA") */
  value: string
  /** La unidad chica debajo ("REPS", "SEG"); vacía si la dosis no la trae */
  unit: string
}

const UNIT_SUFFIX = /\s+(REPS|SEG)$/

/**
 * Parte la dosis compacta ("8 REPS", "30 SEG", "10 · 12 REPS", "8 - 10 - ...", "PAUSA") en valor +
 * unidad para la placa. La TV muestra solo el número; en el player la unidad queda chica abajo para
 * no perder qué se está contando.
 */
export function splitDose(quickDose: string): DosePlate {
  const text = quickDose.trim()
  const match = UNIT_SUFFIX.exec(text)
  if (!match) return { value: text, unit: '' }
  return { value: text.slice(0, match.index), unit: match[1] }
}
