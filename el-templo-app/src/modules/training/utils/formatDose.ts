import type { Block, Prescription } from '../types/session'

/** Fields shared between Prescription and mobility exercises */
interface DoseFields {
  reps: number | null
  seconds: number | null
  notes?: string | null
  repsMax?: number | null
  secondsMax?: number | null
  increment?: number | null
  contraction?: string | null
}

/** Lo que necesitan las series de pirámide y ladder (prescripción o movilidad). */
type SeriesFields = Pick<
  DoseFields,
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

const LADDER_TYPES: ReadonlySet<string> = new Set([
  'ladder',
  'ladder_corta',
  'ladder_block',
  'broken_ladder',
])

/**
 * Whether the block's doses are a ladder. Mismo criterio que `isLadderFormat`
 * del editor del admin (constants/formats.ts) y que la TV.
 */
export function isLadderBlock(block: Pick<Block, 'format' | 'formatParams'>): boolean {
  const type = block.formatParams?.type
  if (typeof type === 'string' && type !== 'standard') return LADDER_TYPES.has(type)
  return typeof block.format === 'string' && block.format.toLowerCase().includes('ladder')
}

/**
 * Cómo se dibuja la dosis de un bloque (mismo criterio que la TV):
 * - `pyramid`: serie de subida y bajada (`pyramidSequence`).
 * - `ladder`: escalera por ejercicio (`ladderSequence`), con la variante del bloque.
 * - `standard`: reps/segundos/rango/escalera Death By.
 */
export type DoseShape =
  | { kind: 'standard' }
  | { kind: 'pyramid' }
  | { kind: 'ladder'; variant: string | null; blockSize: number | null; breakAfter: number | null }

export const STANDARD_DOSE: DoseShape = { kind: 'standard' }
export const PYRAMID_DOSE: DoseShape = { kind: 'pyramid' }

function positiveOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function doseShapeOf(block: Pick<Block, 'format' | 'formatParams'>): DoseShape {
  if (isPyramidBlock(block)) return PYRAMID_DOSE
  if (isLadderBlock(block)) {
    const params = block.formatParams
    return {
      kind: 'ladder',
      variant: typeof params?.type === 'string' ? params.type : null,
      blockSize: positiveOrNull(params?.blockSize),
      breakAfter: positiveOrNull(params?.breakAfter),
    }
  }
  return STANDARD_DOSE
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
export function pyramidSequence(exercise: SeriesFields): string {
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
 * Escalera de un ejercicio en un bloque ladder. Contrato del editor del admin,
 * del PDF y de la TV: inicio en `repsMax`/`secondsMax`, paso en `increment`,
 * rondas en `reps`/`seconds` (segundos si la contracción es ISO).
 * Ej. inicio 20, paso 5, 3 rondas → "20-25-30".
 *
 * Antes se trataba como escalera Death By tomando las RONDAS como inicio:
 * 20 / paso 5 / 3 rondas salía "3 - 8 - 13 - ..." (bug reportado por un profe
 * el 2026-10-29). Lo que falte usa los defaults del editor y del PDF (inicio 1,
 * paso 1, 5 rondas). `unit` va al final de la escalera simple y en cada
 * escalón de las variantes (`ladder_block` "2x3-4x3...", `broken_ladder`
 * "1-2-3 | 1-2-3 | ..."), igual que el PDF.
 */
export function ladderSequence(
  exercise: SeriesFields,
  shape: Extract<DoseShape, { kind: 'ladder' }>,
  unit = '',
): string {
  const isIso = exercise.contraction === 'ISO'
  const start = (isIso ? exercise.secondsMax : exercise.repsMax) || 1
  const step = exercise.increment || 1
  const rounds = (isIso ? exercise.seconds : exercise.reps) || 5
  const steps = (count: number): number[] =>
    Array.from({ length: count }, (_, i) => start + i * step)

  if (shape.variant === 'ladder_block') {
    const blockSize = shape.blockSize ?? 3
    return `${steps(Math.min(rounds, 4))
      .map((n) => `${n}${unit}x${blockSize}`)
      .join('-')}...`
  }
  if (shape.variant === 'broken_ladder') {
    const segment = steps(shape.breakAfter ?? 3)
      .map((n) => `${n}${unit}`)
      .join('-')
    return `${segment} | ${segment} | ...`
  }
  // ladder / ladder_corta: hasta 7 escalones completos; más largo, se resume
  // con los 3 primeros y los 2 últimos ("1-2-3...9-10"), igual que el PDF.
  const values = steps(rounds)
  const seq =
    values.length <= 7
      ? values.join('-')
      : `${values.slice(0, 3).join('-')}...${values.slice(-2).join('-')}`
  return `${seq}${unit}`
}

/**
 * Format prescription inline (compact format for block exercise lists).
 * Returns: "8 · CON" or "30s ISO". `shape` = how the block draws its doses
 * (`doseShapeOf`).
 */
export function formatInlinePrescription(
  exercise: Prescription,
  shape: DoseShape = STANDARD_DOSE,
): string {
  // PAUSA exercise (I Go You Go)
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  const isIso = exercise.contraction === 'ISO'
  if (shape.kind === 'pyramid') {
    const seq = pyramidSequence(exercise)
    if (seq) return isIso ? `${seq}s ISO` : `${seq} · ${exercise.contraction}`
  }
  if (shape.kind === 'ladder') {
    return isIso
      ? `${ladderSequence(exercise, shape, 's')} ISO`
      : `${ladderSequence(exercise, shape)} · ${exercise.contraction}`
  }

  // Death By sequence
  if (shape.kind === 'standard' && exercise.increment) {
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
 * mobility exercises. Pyramid and ladder blocks (`shape`, from `doseShapeOf`)
 * draw their own series like `formatQuickDose`.
 */
export function formatDose(exercise: DoseFields, shape: DoseShape = STANDARD_DOSE): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  const series = seriesDose(exercise, shape)
  if (series) return series

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
 * Serie de un bloque pirámide o ladder con su unidad ("20-25-30 SEG",
 * "10-12-10 REPS"); '' si no aplica (bloque estándar o pirámide sin serie).
 */
function seriesDose(exercise: SeriesFields, shape: DoseShape): string {
  const unit = exercise.contraction === 'ISO' ? 'SEG' : 'REPS'
  if (shape.kind === 'pyramid') {
    const seq = pyramidSequence(exercise)
    return seq ? `${seq} ${unit}` : ''
  }
  if (shape.kind === 'ladder') return `${ladderSequence(exercise, shape)} ${unit}`
  return ''
}

/**
 * Compact dose string for list views.
 * Same logic as formatDose but truncates Death By increments to 2 terms.
 * `shape` = how the block draws its doses (`doseShapeOf`).
 */
export function formatQuickDose(exercise: Prescription, shape: DoseShape = STANDARD_DOSE): string {
  if (exercise.notes === 'PAUSA') return 'PAUSA'

  const series = seriesDose(exercise, shape)
  if (series) return series

  const standard = shape.kind === 'standard'
  if (exercise.reps !== null && exercise.reps > 0) {
    if (standard && exercise.increment) {
      return `${exercise.reps} - ${exercise.reps + exercise.increment} - ...`
    }
    const repsText =
      exercise.repsMax && exercise.repsMax > exercise.reps
        ? `${exercise.reps} \u00B7 ${exercise.repsMax}`
        : `${exercise.reps}`
    return `${repsText} REPS`
  }

  if (exercise.seconds !== null && exercise.seconds > 0) {
    if (standard && exercise.increment) {
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
