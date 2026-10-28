import { daysBetween, formatShortDateEs } from 'src/utils/short-date'
import type { PlanSummary, PlanSummaryItem } from '../types'

/**
 * Modelo de la card "Tu plan" (sketch 028 D). Función pura: recibe el resumen del API y el día de
 * hoy en la sede ("YYYY-MM-DD") y devuelve exactamente lo que se dibuja. Sin "Cubierto hasta…" y
 * sin montos en ningún estado (decisión de Franco, 2026-10-28).
 */

/** Pase especial / plan que vence pronto: días a partir de los cuales se avisa. */
export const EXPIRING_SOON_DAYS = 3
/** Sin renovación cargada: desde cuántos días antes del vencimiento se muestra el nodo vacío. */
export const NO_RENEWAL_HINT_DAYS = 7

export type PillTone = 'ok' | 'new' | 'mid' | 'low'

export interface TimelinePill {
  text: string
  tone: PillTone
  /** Ícono Material opcional a la izquierda del texto. */
  icon?: 'check' | 'pause' | 'schedule'
}

export interface CurrentNode {
  kind: 'current'
  name: string
  /** "3 clases por semana" o "Te quedan 3 de 8 clases". Null si el plan no trae ninguno. */
  meta: string | null
  /** "Del 1 nov al 30 nov · quedan 3 días". */
  period: string
  /** 0..100, o null si no hay fin de período para medirlo. */
  progress: number | null
  pill: TimelinePill | null
}

export interface GapNode {
  kind: 'gap'
  title: string
  detail: string | null
}

export interface NextNode {
  kind: 'next'
  label: 'Después sigue' | 'Después cambia a'
  name: string
  period: string
  pill: TimelinePill
  /** Cargada y ya vista: el nodo se cierra con ✓. */
  confirmed: boolean
}

export interface EmptyNode {
  kind: 'empty'
  label: 'Después'
  text: string
}

export type TimelineNode = CurrentNode | GapNode | NextNode | EmptyNode

export interface TimelineCta {
  label: string
  /** Texto prellenado del WhatsApp. */
  message: string
}

export type PlanTimelineModel =
  | { kind: 'timeline'; kicker: 'Tu plan'; nodes: TimelineNode[] }
  | { kind: 'no-plan'; kicker: 'Tu plan'; title: string; text: string; cta: TimelineCta }
  | { kind: 'welcome'; kicker: 'Bienvenido'; title: string; text: string; cta: TimelineCta }

const NO_RENEWAL_TEXT =
  'Todavía no hay renovación cargada. Cuando la carguemos aparece acá y te avisamos al teléfono.'

function isSpecial(item: PlanSummaryItem): boolean {
  return item.planCategory === 'especial'
}

/** "Del 1 nov al 30 nov", o "Desde el 1 nov" si la membresía no tiene fin. */
function periodRange(item: PlanSummaryItem, today: string): string {
  const from = formatShortDateEs(item.startDate, today)
  if (item.endDate === null) return `Desde el ${from}`
  return `Del ${from} al ${formatShortDateEs(item.endDate, today)}`
}

function daysLeftText(daysLeft: number): string {
  if (daysLeft === 0) return 'vence hoy'
  return daysLeft === 1 ? 'queda 1 día' : `quedan ${daysLeft} días`
}

function currentMeta(item: PlanSummaryItem): string | null {
  if (item.classesBudget !== null && item.classesRemaining !== null) {
    return `Te quedan ${item.classesRemaining} de ${item.classesBudget} clases`
  }
  if (item.classesPerWeek !== null) {
    return item.classesPerWeek === 1
      ? '1 clase por semana'
      : `${item.classesPerWeek} clases por semana`
  }
  return null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function currentProgress(item: PlanSummaryItem, daysLeft: number | null): number | null {
  // Pase con tope de clases: lo que queda del saldo.
  if (item.classesBudget !== null && item.classesRemaining !== null && item.classesBudget > 0) {
    return clampPercent((100 * item.classesRemaining) / item.classesBudget)
  }
  if (item.endDate === null || daysLeft === null) return null
  const total = daysBetween(item.startDate, item.endDate)
  if (total <= 0) return 0
  return clampPercent((100 * daysLeft) / total)
}

function currentPill(
  item: PlanSummaryItem,
  daysLeft: number | null,
  today: string,
): TimelinePill | null {
  if (item.status === 'paused') {
    return {
      text: item.pauseEndDate
        ? `En pausa hasta el ${formatShortDateEs(item.pauseEndDate, today)}`
        : 'En pausa',
      tone: 'mid',
      icon: 'pause',
    }
  }
  if (!isSpecial(item) && daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS) {
    return { text: 'Vence pronto', tone: 'low', icon: 'schedule' }
  }
  return null
}

function buildCurrent(item: PlanSummaryItem, today: string): CurrentNode {
  const daysLeft = item.endDate === null ? null : daysBetween(today, item.endDate)
  // Fin ya pasado (pausa con fecha vieja): no se cuenta un vencimiento que no aplica.
  const period =
    daysLeft === null || daysLeft < 0
      ? periodRange(item, today)
      : `${periodRange(item, today)} · ${daysLeftText(daysLeft)}`
  return {
    kind: 'current',
    name: item.planName,
    meta: currentMeta(item),
    period,
    progress: currentProgress(item, daysLeft),
    pill: currentPill(item, daysLeft, today),
  }
}

function buildNext(
  next: PlanSummaryItem,
  current: PlanSummaryItem | null,
  today: string,
): NextNode {
  const changes = current !== null && next.planId !== current.planId
  return {
    kind: 'next',
    label: changes ? 'Después cambia a' : 'Después sigue',
    name: next.planName,
    period: periodRange(next, today),
    pill: next.isNew
      ? { text: 'Nuevo', tone: 'new' }
      : { text: 'Cargada', tone: 'ok', icon: 'check' },
    confirmed: !next.isNew,
  }
}

/** ¿Se muestra el nodo "Todavía no hay renovación cargada"? Solo plan regular activo, a ≤7 días. */
function needsRenewalHint(current: PlanSummaryItem, today: string): boolean {
  if (current.status === 'paused' || isSpecial(current) || current.endDate === null) return false
  return daysBetween(today, current.endDate) <= NO_RENEWAL_HINT_DAYS
}

export function buildPlanTimeline(summary: PlanSummary, today: string): PlanTimelineModel {
  const { current, next, history } = summary
  const nodes: TimelineNode[] = []

  if (current) nodes.push(buildCurrent(current, today))

  if (!current && next) {
    const last = history[0]
    nodes.push({
      kind: 'gap',
      title: 'Hoy no tenés plan',
      detail:
        last && last.endDate
          ? `Tu plan anterior venció el ${formatShortDateEs(last.endDate, today)}`
          : null,
    })
  }

  if (next) {
    nodes.push(buildNext(next, current, today))
  } else if (current && needsRenewalHint(current, today)) {
    nodes.push({ kind: 'empty', label: 'Después', text: NO_RENEWAL_TEXT })
  }

  if (nodes.length > 0) return { kind: 'timeline', kicker: 'Tu plan', nodes }

  const last = history[0]
  if (last) {
    const venció = last.endDate
      ? ` venció el ${formatShortDateEs(last.endDate, today)}.`
      : ' venció.'
    return {
      kind: 'no-plan',
      kicker: 'Tu plan',
      title: 'Sin plan activo',
      text: `Tu último plan, ${last.planName},${venció}`,
      cta: {
        label: 'Renovar por WhatsApp',
        message: `Hola! Quiero renovar mi plan ${last.planName}.`,
      },
    }
  }

  return {
    kind: 'welcome',
    kicker: 'Bienvenido',
    title: 'Elegí tu plan',
    text: 'Te lo cargamos en recepción o por WhatsApp.',
    cta: { label: 'Consultar por WhatsApp', message: 'Hola! Quiero elegir mi plan.' },
  }
}
