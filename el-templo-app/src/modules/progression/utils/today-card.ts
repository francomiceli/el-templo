/**
 * Fase 199 (D-01, D-03, D-04, D-05): contenido de la card de hoy de Mi Templo.
 *
 * `resolveTodayCard(input)` es PURA: sin stores, sin axios, sin reloj. Todo
 * (incluido `todayStr`/`dow`, calculados en la zona de la SEDE) entra por `input`,
 * así cada gate se prueba sin montar componentes. La vista (plan 15) solo pinta
 * el `TodayCardModel`.
 *
 * Precedencia de gates (de arriba hacia abajo, gana el primero que aplica). Fuente: UAT
 * D3/D4/D5/D11 y confirmaciones C1/C2 de Franco (la card nunca le dice al socio que frene):
 *
 *  0. `hasPlan` = suscripción active/paused O `planStatus.hasActivePlan` (respaldo: si la
 *     suscripción no vino pero el plan-status dice que hay plan, NUNCA es "sin plan").
 *     `hasScheduled` = suscripción `scheduled` O `planStatus.hasScheduledPlan` (D4: un plan
 *     programado se trata igual que uno activo). `canTrain = hasPlan || hasScheduled`.
 *     Sin `canTrain` y `planLoading` → `cargando` (ningún gate de "sin plan" se decide
 *     mientras algo carga).
 *  1. Sin `canTrain` (y nada cargando): sede virtual → `online-libre` (con "Ver planes");
 *     `planStatus.hadPlan` → `sin-plan-vencio`; si no (incluye `planStatus` null por error
 *     de red, fail-open) → `sin-plan-nunca`.
 *  2. Sesión de hoy completada → `completada`.
 *  3. Virtual: con programa → `online-programa` SIEMPRE (domingo y días sin sesión
 *     incluidos, D3); sin programa → `online-libre` con "Entrenar" y sin "Ver planes".
 *  4. Presencial:
 *     - D5: una clase de hoy con la ventana cerrada (`windowState === 'after'`) y sin
 *       asistencia se trata como si no existiera;
 *     a. clase de hoy vigente → `presencial-turno`;
 *     b. reservas todavía cargando (`bookingsLoading`) → `cargando` (no se afirma que
 *        falta reservar por una carrera);
 *     c. lista de espera de hoy → `presencial-sin-turno` (variante lista de espera);
 *     d. próxima clase reservada (`nextBooking`) → `presencial-proxima` (C1);
 *     e. si no → `presencial-sin-turno` con "Reservá tu clase" (C2, cualquier día).
 *
 * El QR de check-in NO se decide acá: su única fuente de verdad es
 * `useTodayBookingStore.fabVisible`. La card solo informa la ventana con chips.
 */

import type { MemberPlanStatus } from 'src/types/plan-status'

export type TodayCardKind =
  | 'cargando'
  | 'presencial-turno'
  | 'presencial-sin-turno'
  | 'presencial-proxima'
  | 'completada'
  | 'online-programa'
  | 'online-libre'
  | 'sin-plan-nunca'
  | 'sin-plan-vencio'

/** Texto en tramos: permite resaltar ("Tu clase: **19:00**") sin HTML. */
export type TodayCardText = { text: string; strong?: boolean }[]

export interface TodayCardAction {
  label: string
  to?: string | { name: string }
  action?: 'open-program'
}

export interface TodayCardChip {
  icon: string
  text: string
  tone: 'neutral' | 'ok'
}

export interface TodayCardModel {
  kind: TodayCardKind
  kicker: string
  title: string
  meta: TodayCardText | null
  chips: TodayCardChip[]
  /** 0..1 o null (sin barra). */
  progress: number | null
  /** null solo en `cargando`. */
  primary: TodayCardAction | null
  secondary: TodayCardAction | null
  tertiary: TodayCardAction | null
  hook: TodayCardText | null
}

export interface TodayCardInput {
  /** "YYYY-MM-DD" de hoy en la zona de la sede. */
  todayStr: string
  /** 1..7 (lunes..domingo) en la zona de la sede. */
  dow: number
  firstName: string | null
  branchName: string
  isVirtual: boolean
  subscription: { status: string; planName: string; startDate: string } | null
  planStatus: MemberPlanStatus | null
  /** userStore.planStateLoading: suscripción no intentada/cargando o plan-status pendiente. */
  planLoading: boolean
  /**
   * useTodayBookingStore aún no respondió (`!loaded`). Solo importa al socio presencial con plan:
   * sin las reservas de hoy no se sabe si tiene clase, así que no se afirma que falte reservar.
   * El store es fail-open (tras un error también queda cargado), no traba la card.
   */
  bookingsLoading: boolean
  todayRoute: string | null
  todayCompleted: boolean
  todaySession: { durationMinutes: number | null; rpe: number | null } | null
  booking: { time: string; branchName: string; activityName: string; status: string } | null
  windowState: 'before' | 'open' | 'after' | null
  minutesToStart: number | null
  attendanceMarkedAt: string | null
  waitlistTime: string | null
  nextBooking: { date: string; time: string; branchName: string } | null
  program: {
    programName: string
    currentWeek: number
    durationWeeks: number | null
    sessionsCompletedThisWeek: number
    sessionsPerWeekToAdvance: number
  } | null
  hasExtraPrograms: boolean
  trialEligible: boolean
}

// ── Helpers de fecha (siempre sobre el string de la sede, nunca la zona del teléfono) ──

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

function utcMidnight(dateStr: string): number | null {
  const p = parseYmd(dateStr)
  return p ? Date.UTC(p.y, p.m - 1, p.d) : null
}

const LONG_DATE_FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
})

const WEEKDAY_FMT = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long' })

// Kickers de los casos de hoy: dicen de qué es la card. La fecha ya está en el saludo
// del encabezado ("Hoy es viernes, 16 de octubre"), no se repite acá (UAT 2026-10-16).
const KICKER_TURNO = 'Tu clase de hoy'
const KICKER_SIN_TURNO = 'Sin clase reservada'
const KICKER_COMPLETADA = 'Hoy ya entrenaste'

/** "2026-09-30" → "30 de septiembre". */
export function formatLongDate(dateStr: string): string {
  const ms = utcMidnight(dateStr)
  if (ms === null) return dateStr
  return LONG_DATE_FMT.format(ms)
}

/** "El Templo Alem" → "Alem". */
export function shortBranchName(name: string): string {
  return name.replace(/^El Templo\s+/i, '').trim()
}

function hhmm(time: string): string {
  return time.slice(0, 5)
}

/** ("2026-10-19", "19:00") → "Lunes 19 · 19:00". Fecha inválida → solo la hora. */
export function formatNextClassTitle(dateStr: string, time: string): string {
  const p = parseYmd(dateStr)
  if (!p) return hhmm(time)
  const weekday = WEEKDAY_FMT.format(Date.UTC(p.y, p.m - 1, p.d))
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalized} ${p.d} · ${hhmm(time)}`
}

// ── Piezas reutilizables ──

const PLANES: TodayCardAction = { label: 'Ver planes', to: '/planes' }
const OPEN_PROGRAM: TodayCardAction = { label: 'Mi programa', action: 'open-program' }

function emptyModel(
  kind: TodayCardKind,
  kicker: string,
  title: string,
  over: Partial<TodayCardModel> = {},
): TodayCardModel {
  return {
    kind,
    kicker,
    title,
    meta: null,
    chips: [],
    progress: null,
    primary: null,
    secondary: null,
    tertiary: null,
    hook: null,
    ...over,
  }
}

function hookFor(input: TodayCardInput): TodayCardText | null {
  if (input.isVirtual || !input.todayRoute) return null
  return [
    { text: `Hoy en ${shortBranchName(input.branchName)} se entrena ` },
    { text: input.todayRoute, strong: true },
  ]
}

// ── Gates ──

function onlineLibre(input: TodayCardInput, canTrain: boolean): TodayCardModel {
  return emptyModel('online-libre', 'Hoy', input.todayRoute ?? 'Sesión libre', {
    primary: { label: 'Entrenar', to: '/training' },
    secondary: canTrain ? null : PLANES,
  })
}

function sinPlanVencio(input: TodayCardInput): TodayCardModel {
  const last = input.planStatus?.lastPlan ?? null
  const planName = last?.planName ?? 'plan'
  const meta =
    last?.endDate && parseYmd(last.endDate)
      ? `Tu ${planName} venció el ${formatLongDate(last.endDate)}.`
      : `Tu ${planName} terminó.`
  return emptyModel(
    'sin-plan-vencio',
    input.firstName ? `Te extrañamos, ${input.firstName}` : 'Te extrañamos',
    'Renová tu plan',
    {
      meta: [{ text: meta }],
      primary: { label: 'Renovar', to: '/planes' },
      secondary: { label: 'Ver otros planes', to: '/planes' },
      hook: hookFor(input),
    },
  )
}

function sinPlanNunca(input: TodayCardInput): TodayCardModel {
  return emptyModel('sin-plan-nunca', 'Empezá hoy', 'Arrancá tu plan', {
    meta: [{ text: 'Elegí cómo querés entrenar: en tu sede o online.' }],
    primary: PLANES,
    secondary: input.trialEligible ? { label: 'Clase de prueba gratis', to: '/reservas' } : null,
    hook: hookFor(input),
  })
}

function completada(input: TodayCardInput): TodayCardModel {
  const session = input.todaySession
  const parts = ['Completada']
  if (session?.durationMinutes != null) parts.push(`${session.durationMinutes} min`)
  if (session?.rpe != null) parts.push(`RPE ${session.rpe}`)
  return emptyModel('completada', KICKER_COMPLETADA, input.todayRoute ?? 'Sesión completada', {
    chips: [{ icon: 'check_circle', text: parts.join(' · '), tone: 'ok' }],
    primary: { label: 'Ver resumen', to: { name: 'session-summary' } },
  })
}

function onlinePrograma(
  input: TodayCardInput,
  program: NonNullable<TodayCardInput['program']>,
): TodayCardModel {
  const week = program.durationWeeks
    ? `Semana ${program.currentWeek} de ${program.durationWeeks}`
    : `Semana ${program.currentWeek}`
  const done = program.sessionsCompletedThisWeek
  const target = program.sessionsPerWeekToAdvance
  const sessions =
    target > 0
      ? `${done} de ${target} sesiones esta semana`
      : `${done} ${done === 1 ? 'sesión' : 'sesiones'} esta semana`
  return emptyModel(
    'online-programa',
    `Hoy · ${program.programName}`,
    input.todayRoute ?? program.programName,
    {
      meta: [{ text: `${week} · ${sessions}` }],
      progress: target > 0 ? Math.min(done / target, 1) : null,
      primary: { label: 'Entrenar', to: '/training' },
      secondary: OPEN_PROGRAM,
    },
  )
}

function presencialTurno(
  input: TodayCardInput,
  booking: NonNullable<TodayCardInput['booking']>,
): TodayCardModel {
  const chips: TodayCardChip[] = []
  if (input.attendanceMarkedAt) {
    chips.push({
      icon: 'check_circle',
      text: `Asistencia registrada ${input.attendanceMarkedAt}`,
      tone: 'ok',
    })
  } else if (input.windowState === 'open') {
    const min = input.minutesToStart
    chips.push({
      icon: 'schedule',
      text: min !== null && min > 0 ? `Tu clase empieza en ${min} min` : 'Tu clase ya empezó',
      tone: 'neutral',
    })
  }

  const branch = shortBranchName(booking.branchName)
  return emptyModel('presencial-turno', KICKER_TURNO, input.todayRoute ?? booking.activityName, {
    meta: [
      { text: 'Tu clase: ' },
      { text: hhmm(booking.time), strong: true },
      { text: ` · ${branch}` },
    ],
    chips,
    primary: { label: 'Ver la sesión', to: '/training' },
    secondary: { label: 'Cambiar clase', to: '/reservas' },
  })
}

/** C1: el título es la fecha y hora de la próxima clase reservada, no la sesión. */
function presencialProxima(
  input: TodayCardInput,
  next: NonNullable<TodayCardInput['nextBooking']>,
): TodayCardModel {
  return emptyModel(
    'presencial-proxima',
    'Tu próxima clase',
    formatNextClassTitle(next.date, next.time),
    {
      meta: [{ text: shortBranchName(next.branchName) }],
      primary: { label: 'Mis clases', to: '/reservas' },
      secondary: { label: 'Cambiar clase', to: '/reservas' },
    },
  )
}

/** C2: sin ninguna clase reservada, cualquier día, la card invita a reservar. */
function presencialSinTurno(input: TodayCardInput): TodayCardModel {
  const meta: TodayCardText = input.waitlistTime
    ? [{ text: `Estás en lista de espera · ${hhmm(input.waitlistTime)}` }]
    : [{ text: 'Elegí día, horario y sede' }]
  return emptyModel('presencial-sin-turno', KICKER_SIN_TURNO, 'Reservá tu clase', {
    meta,
    primary: { label: 'Reservar', to: '/reservas' },
    secondary: null,
  })
}

function withExtraPrograms(model: TodayCardModel, input: TodayCardInput): TodayCardModel {
  if (input.hasExtraPrograms && !input.isVirtual) {
    return { ...model, tertiary: { label: 'Tus programas', action: 'open-program' } }
  }
  return model
}

export function resolveTodayCard(input: TodayCardInput): TodayCardModel {
  const hasPlan =
    input.subscription?.status === 'active' ||
    input.subscription?.status === 'paused' ||
    input.planStatus?.hasActivePlan === true
  const hasScheduled =
    input.subscription?.status === 'scheduled' || input.planStatus?.hasScheduledPlan === true
  const canTrain = hasPlan || hasScheduled

  // 0. Nada de "sin plan" mientras algo carga.
  if (!canTrain && input.planLoading) {
    return emptyModel('cargando', '', '')
  }

  // 1. Sin plan (ni programado).
  if (!canTrain) {
    if (input.isVirtual) return onlineLibre(input, false)
    if (input.planStatus?.hadPlan === true) return sinPlanVencio(input)
    return sinPlanNunca(input)
  }

  // 2. Sesión de hoy completada.
  if (input.todayCompleted) return withExtraPrograms(completada(input), input)

  // 3. Virtual: siempre se puede entrenar.
  if (input.isVirtual) {
    if (!input.program) return onlineLibre(input, true)
    return onlinePrograma(input, input.program)
  }

  // 4. Presencial. D5: una clase de hoy ya pasada y sin asistencia es como si no existiera.
  const missedToday =
    input.booking !== null && input.windowState === 'after' && input.attendanceMarkedAt === null
  const activeBooking = missedToday ? null : input.booking
  if (activeBooking) return withExtraPrograms(presencialTurno(input, activeBooking), input)
  // Sin saber si hay clase hoy no se decide "reservá" (A1 del plan 20).
  if (input.bookingsLoading) return emptyModel('cargando', '', '')
  if (input.waitlistTime) return withExtraPrograms(presencialSinTurno(input), input)
  if (input.nextBooking) {
    return withExtraPrograms(presencialProxima(input, input.nextBooking), input)
  }
  return withExtraPrograms(presencialSinTurno(input), input)
}
