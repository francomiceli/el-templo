import type { CalibrationProposal, Estado, Level, StepKey, Unit } from '../types'

/** Letra griega de cada escalón de la sesión (§10): Α, Β, Γ y el hold final Ω. */
export const GREEK_STEP: Record<StepKey, string> = {
  e1: 'Α',
  e2: 'Β',
  e3: 'Γ',
  hold: 'Ω',
}

export interface LevelInfo {
  name: string
  kicker: string
  text: string
}

/** Textos de los tres niveles (prototipo `NIV`, §2). */
export const LEVEL_INFO: Record<Level, LevelInfo> = {
  ternero: {
    name: 'Ternero',
    kicker: 'Inicial',
    text: 'Aprendés el método. Cortás una rep antes del fallo en cada escalón.',
  },
  novillo: {
    name: 'Novillo',
    kicker: 'Intermedio',
    text: 'Llegás al fallo en el último escalón de cada serie.',
  },
  toro: {
    name: 'Toro',
    kicker: 'Avanzado',
    text: 'Los tres escalones al fallo. El método completo.',
  },
}

/**
 * Valor de un escalón con su unidad: "4 reps", "1 rep", "6 s". Los ejercicios unilaterales se
 * cargan por lado: "4 por lado" (reps) o "6 s por lado" (segundos).
 */
export function unitText(value: number, unit: Unit, unilateral: boolean): string {
  if (unit === 's') return unilateral ? `${value} s por lado` : `${value} s`
  if (unilateral) return `${value} por lado`
  return value === 1 ? '1 rep' : `${value} reps`
}

export type EstadoTone = 'subir' | 'techo' | 'bajo' | 'rango' | 'neutro'

export interface EstadoChip {
  label: string
  tone: EstadoTone
}

const ESTADO_CHIPS: Record<Estado, EstadoChip> = {
  subir: { label: 'Subir de progresión', tone: 'subir' },
  techo1: { label: 'Techo 1 de 2', tone: 'techo' },
  bajo: { label: 'Bajo el piso', tone: 'bajo' },
  rango: { label: 'En rango', tone: 'rango' },
  sin_datos: { label: 'Sin datos', tone: 'neutro' },
}

/** Chip del estado que calcula el motor. Un escalón sin estado (el hold) va neutro. */
export function estadoChip(estado: Estado | null): EstadoChip {
  return ESTADO_CHIPS[estado ?? 'sin_datos']
}

/**
 * Cuánto esfuerzo pide cada escalón según el nivel (§2). Ternero corta antes del fallo en todo;
 * Novillo llega al fallo recién en el último escalón; Toro, en los tres. El hold final es al fallo
 * salvo en Ternero.
 */
export function effortHint(level: Level, step: StepKey): string {
  if (step === 'hold') return level === 'ternero' ? 'Cortá antes del fallo' : 'Al fallo'
  if (level === 'ternero') return 'Dejá 1 rep'
  if (level === 'novillo') return step === 'e3' ? 'Al fallo' : 'Dejá 1 rep'
  return 'Al fallo'
}

/** Qué es "fallo" en el ejercicio: con brazos rectos es técnico, con flexionados es muscular (§1.4). */
export function failureHint(brazosRectos: boolean): string {
  return brazosRectos ? 'Fallo técnico: cortá cuando se rompe la línea' : 'Fallo muscular'
}

/** "2026-10-21" -> "21/10" (sin pasar por Date: no hay zona horaria que mezclar). */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${Number(day)}/${Number(month)}`
}

/** Solo se puede aceptar o rechazar si el API propone mover el ejercicio y hay a dónde (S12-4). */
export function canResolveCalibration(item: CalibrationProposal): boolean {
  return item.proposal !== 'quedarse' && item.toRungName !== null
}

/** Texto de una propuesta de calibración de la semana 1 (S12-4), en la hoja de Hoy y en Progreso. */
export function calibrationText(item: CalibrationProposal): string {
  if (item.proposal === 'quedarse') return `${item.exerciseName}: quedate en ${item.fromRungName}`
  if (item.toRungName === null) {
    return item.proposal === 'subir'
      ? `${item.exerciseName}: ya estás en la más difícil`
      : `${item.exerciseName}: ya estás en la más fácil`
  }
  const verb = item.proposal === 'subir' ? 'subir a' : 'bajar a'
  return `Tu primera sesión de ${item.exerciseName} propone ${verb} ${item.toRungName}`
}
