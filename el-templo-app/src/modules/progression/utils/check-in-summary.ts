// Helpers puros del Registro del día compacto y de Tu semana (fase 199, D-07/D-09).
// Sin reloj ni estado: la fecha de hoy y las respuestas se inyectan.

import { addDaysStr } from 'src/utils/check-in-window'
import { BODY_AREA_OPTIONS } from '../types'
import type { CheckInAnswerValue, CheckInQuestionConfig, CheckInQuestionType } from '../types'

export type CheckInAnswers = Record<CheckInQuestionType, CheckInAnswerValue | null>

/** Primera pregunta del orden que todavía no tiene respuesta, o null si están las tres. */
export function nextUnanswered(
  ordered: CheckInQuestionConfig[],
  answers: CheckInAnswers,
): CheckInQuestionConfig | null {
  return ordered.find((q) => !answers[q.type]) ?? null
}

/** Cantidad de preguntas del orden que ya tienen respuesta. */
export function answeredCount(ordered: CheckInQuestionConfig[], answers: CheckInAnswers): number {
  return ordered.filter((q) => answers[q.type]).length
}

const ANSWER_LABELS: Record<CheckInQuestionType, Record<string, string>> = {
  // UAT D16 + confirmación C4: el resumen usa la misma etiqueta que el botón; el valor guardado sigue siendo alto.
  energy: { bajo: 'Energía: bajo', normal: 'Energía: normal', alto: 'Energía: bien' },
  soreness: { ninguna: 'Sin molestias', leve: 'Molestia leve', moderada: 'Molestia moderada' },
  sleep: { mal: 'Dormiste mal', ok: 'Dormiste ok', bien: 'Dormiste bien' },
}

/** "Energía: normal", "Sin molestias", "Molestia leve (hombros)", "Dormiste bien". */
export function answerLabel(
  type: CheckInQuestionType,
  value: string,
  bodyArea: string | null,
): string {
  const base = ANSWER_LABELS[type][value] ?? value
  if (type !== 'soreness' || value === 'ninguna' || !bodyArea) return base
  const area = BODY_AREA_OPTIONS.find((a) => a.value === bodyArea)?.label ?? bodyArea
  return `${base} (${area.toLowerCase()})`
}

/** Etiquetas de las respuestas existentes, en el orden de `ordered` (las sin responder se omiten). */
export function summaryParts(ordered: CheckInQuestionConfig[], answers: CheckInAnswers): string[] {
  const parts: string[] = []
  for (const q of ordered) {
    const a = answers[q.type]
    if (a) parts.push(answerLabel(q.type, a.value, a.bodyArea))
  }
  return parts
}

export interface WeekDot {
  letter: string
  date: string
  trained: boolean
  isToday: boolean
}

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Los 7 días lunes..domingo de la semana que empieza en `weekStart`. */
export function weekDots(weekStart: string, todayStr: string, completedDates: string[]): WeekDot[] {
  const trained = new Set(completedDates)
  return LETTERS.map((letter, i) => {
    const date = addDaysStr(weekStart, i)
    return { letter, date, trained: trained.has(date), isToday: date === todayStr }
  })
}

/** Sesiones de la semana: fechas únicas dentro de lunes..domingo. */
export function sessionsThisWeek(weekStart: string, completedDates: string[]): number {
  const week = new Set(Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i)))
  return new Set(completedDates.filter((d) => week.has(d))).size
}

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** "lunes 13: entrenaste", "jueves 16 (hoy): no entrenaste". */
export function dotAriaLabel(dot: WeekDot, index: number): string {
  const day = Number(dot.date.slice(8, 10))
  const today = dot.isToday ? ' (hoy)' : ''
  return `${DAY_NAMES[index]} ${day}${today}: ${dot.trained ? 'entrenaste' : 'no entrenaste'}`
}

/** Texto que sigue al badge del total en "Tu semana": "sesiones en total", "sesión en El Templo" (UAT D21). */
export function sessionsTotalCaption(label: 'total' | 'templo', count: number): string {
  const noun = count === 1 ? 'sesión' : 'sesiones'
  return `${noun} ${label === 'templo' ? 'en El Templo' : 'en total'}`
}
