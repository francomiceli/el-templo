import type { Block, Prescription } from '../types/session'

/** Fields shared between Prescription and mobility exercises */
interface DoseFields {
  reps: number | null
  seconds: number | null
  notes?: string | null
  repsMax?: number | null
  secondsMax?: number | null
  increment?: number | null
}

type PyramidFields = Pick<
  Prescription,
  'contraction' | 'reps' | 'repsMax' | 'seconds' | 'secondsMax' | 'increment'
>

/**
 * Whether the block's doses are a pyramid. Mismo criterio que `isPyramid` del
 * editor del admin: manda `formatParams.type`, salvo que falte o haya quedado
 * en 'standard' (stale); ahí cae al nombre del formato.
 */
export function isPyramidBlock(block: Pick<Block, 'format' | 'formatParams'>): boolean {
  const type = block.formatParams?.type
  if (typeof type === 'string' && type !== 'standard') return type === 'pyramid'
  return typeof block.format === 'string' && block.format.trim().toLowerCase() === 'pyramid'
}

/**
 * Serie de una pirámide, sin unidad. Contrato del editor del admin y del PDF:
 * inicio en `repsMax`/`secondsMax`, paso en `increment`, pico en
 * `reps`/`seconds` (segundos si la contracción es ISO).
 * Ej. inicio 10, paso 2, pico 12 → "10-12-10".
 *
 * Antes se trataba cualquier `increment` como escalera Death By tomando el
 * PICO como inicio (inicio 20 / paso 10 / pico 30 salía "30-40-50-...").
 *
 * Si los parámetros no arman una pirámide (falta inicio o paso, inicio > pico)
 * devuelve solo el pico; sin pico, ''.
 */
export function pyramidSequence(exercise: PyramidFields): string {
  const isIso = exercise.contraction === 'ISO'
  const start = (isIso ? exercise.secondsMax : exercise.repsMax) ?? 0
  const step = exercise.increment ?? 0
  const peak = (isIso ? exercise.seconds : exercise.reps) ?? 0
  if (peak <= 0) return ''
  if (start <= 0 || step <= 0 || start > peak) return `${peak}`

  const up: number[] = []
  for (let v = start; v <= peak; v += step) up.push(v)
  const all = [...up, ...up.slice(0, -1).reverse()]
  // Igual que el PDF y el TV: hasta 5 escalones completos; más largo, se
  // resume con los extremos y el tope ("2-4...10...4-2").
  if (all.length <= 5) return all.join('-')
  return `${all.slice(0, 2).join('-')}...${up[up.length - 1]}...${all.slice(-2).join('-')}`
}

/**
 * Format prescription inline (compact format for block exercise lists).
 * Returns: "8 · CON" or "30s ISO". `pyramid` = the block is a pyramid
 * (`isPyramidBlock`).
 */
export function formatInlinePrescription(exercise: Prescription, pyramid = false): string {
  // PAUSA exercise (I Go You Go)
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  if (pyramid) {
    const seq = pyramidSequence(exercise)
    if (seq) {
      return exercise.contraction === 'ISO' ? `${seq}s ISO` : `${seq} · ${exercise.contraction}`
    }
  }

  // Death By sequence
  if (!pyramid && exercise.increment) {
    const start = exercise.reps || exercise.seconds || 0
    const seq = `${start}-${start + exercise.increment}-${start + exercise.increment * 2}-...`
    return exercise.contraction === 'ISO' ? `${seq}s ISO` : `${seq} · ${exercise.contraction}`
  }

  // For isometric exercises, show duration with ISO
  if (exercise.contraction === 'ISO' && exercise.seconds) {
    // Rango valido solo si el techo supera al piso (secondsMax stale <= seconds).
    const secsText =
      exercise.secondsMax && exercise.secondsMax > exercise.seconds
        ? `${exercise.seconds}-${exercise.secondsMax}`
        : `${exercise.seconds}`
    return `${secsText}s ISO`
  }

  // For rep-based exercises, show count and contraction type
  const parts: string[] = []
  if (exercise.reps) {
    // Solo rango si repsMax > reps; un repsMax <= reps es stale (no "40-16").
    const repsText =
      exercise.repsMax && exercise.repsMax > exercise.reps
        ? `${exercise.reps}-${exercise.repsMax}`
        : `${exercise.reps}`
    parts.push(repsText)
  }
  if (exercise.contraction) {
    parts.push(exercise.contraction)
  }

  return parts.join(' · ')
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
    // Solo es un rango si el techo supera al piso; un repsMax <= reps es dato
    // stale de un formato anterior (no mostrar "40 \u00B7 16" con 16<40).
    const repsText =
      exercise.repsMax && exercise.repsMax > exercise.reps
        ? `${exercise.reps} \u00B7 ${exercise.repsMax}`
        : `${exercise.reps}`
    return `${repsText} REPS`
  }

  if (exercise.seconds !== null && exercise.seconds > 0) {
    if (exercise.increment) {
      const start = exercise.seconds
      const inc = exercise.increment
      return `${start} - ${start + inc} - ${start + inc * 2} - ...`
    }
    const secsText =
      exercise.secondsMax && exercise.secondsMax > exercise.seconds
        ? `${exercise.seconds} \u00B7 ${exercise.secondsMax}`
        : `${exercise.seconds}`
    return `${secsText} SEG`
  }

  return ''
}

/**
 * Compact dose string for list views.
 * Same logic as formatDose but truncates Death By increments to 2 terms.
 * `pyramid` = the block is a pyramid (`isPyramidBlock`).
 */
export function formatQuickDose(exercise: Prescription, pyramid = false): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  if (pyramid) {
    const seq = pyramidSequence(exercise)
    if (seq) return `${seq} ${exercise.contraction === 'ISO' ? 'SEG' : 'REPS'}`
  }

  if (exercise.reps !== null && exercise.reps > 0) {
    if (!pyramid && exercise.increment) {
      return `${exercise.reps} - ${exercise.reps + exercise.increment} - ...`
    }
    const repsText =
      exercise.repsMax && exercise.repsMax > exercise.reps
        ? `${exercise.reps} \u00B7 ${exercise.repsMax}`
        : `${exercise.reps}`
    return `${repsText} REPS`
  }

  if (exercise.seconds !== null && exercise.seconds > 0) {
    if (!pyramid && exercise.increment) {
      return `${exercise.seconds} - ${exercise.seconds + exercise.increment} - ...`
    }
    const secsText =
      exercise.secondsMax && exercise.secondsMax > exercise.seconds
        ? `${exercise.seconds} \u00B7 ${exercise.secondsMax}`
        : `${exercise.seconds}`
    return `${secsText} SEG`
  }

  return ''
}
