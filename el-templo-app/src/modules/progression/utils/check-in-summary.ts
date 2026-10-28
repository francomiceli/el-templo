// Helpers puros del Registro del día compacto y de Tus sesiones (fase 199, D-07/D-09).
// Sin reloj ni estado: la fecha de hoy y las respuestas se inyectan.

import { addDaysStr } from 'src/utils/check-in-window'
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

export type CheckInAdviceTone = 'ok' | 'care'

export interface CheckInAdvice {
  text: string
  tone: CheckInAdviceTone
}

/**
 * Cierre del registro completo (UAT 2026-10-16): un consejo según las respuestas en vez del
 * resumen. Prioridad (D-10 de v4.4): energía baja > molestia moderada > dormiste mal. Si
 * nada de eso pasa, un mensaje positivo. Antes era un chip de la card de hoy.
 */
export function checkInAdvice(answers: CheckInAnswers): CheckInAdvice {
  if (answers.energy?.value === 'bajo') return { text: 'Hoy priorizá la técnica', tone: 'care' }
  if (answers.soreness?.value === 'moderada') {
    return { text: 'Considerá movilidad hoy', tone: 'care' }
  }
  if (answers.sleep?.value === 'mal') return { text: 'Escuchá a tu cuerpo hoy', tone: 'care' }
  return { text: '¡Hoy estás para darlo todo!', tone: 'ok' }
}

export interface WeekDot {
  letter: string
  date: string
  trained: boolean
  isToday: boolean
  /** Día de esta semana que todavía no llegó (posterior a hoy). */
  isFuture: boolean
}

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Los 7 días lunes..domingo de la semana que empieza en `weekStart`. */
export function weekDots(weekStart: string, todayStr: string, completedDates: string[]): WeekDot[] {
  const trained = new Set(completedDates)
  return LETTERS.map((letter, i) => {
    const date = addDaysStr(weekStart, i)
    // YYYY-MM-DD compara bien como string.
    return {
      letter,
      date,
      trained: trained.has(date),
      isToday: date === todayStr,
      isFuture: date > todayStr,
    }
  })
}

/** Sesiones de la semana: fechas únicas dentro de lunes..domingo. */
export function sessionsThisWeek(weekStart: string, completedDates: string[]): number {
  const week = new Set(Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i)))
  return new Set(completedDates.filter((d) => week.has(d))).size
}

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** "lunes 13: entrenaste", "jueves 16 (hoy): no entrenaste", "sábado 18: todavía no llegó". */
export function dotAriaLabel(dot: WeekDot, index: number): string {
  const day = Number(dot.date.slice(8, 10))
  const today = dot.isToday ? ' (hoy)' : ''
  const status = dot.trained ? 'entrenaste' : dot.isFuture ? 'todavía no llegó' : 'no entrenaste'
  return `${DAY_NAMES[index]} ${day}${today}: ${status}`
}

/** Texto que acompaña al total en "Tus sesiones": "sesiones totales en El Templo" (sketch 007 A). */
export function sessionsTotalCaption(count: number): string {
  return `${count === 1 ? 'sesión total' : 'sesiones totales'} en El Templo`
}
