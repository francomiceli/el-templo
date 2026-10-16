/**
 * Fase 199 (D-01, D-03, D-04, D-05): contenido de la card de hoy de Mi Templo.
 *
 * `resolveTodayCard(input)` es PURA: sin stores, sin axios, sin reloj. Todo
 * (incluido `todayStr`/`dow`, calculados en la zona de la SEDE) entra por `input`,
 * así cada gate se prueba sin montar componentes. La vista (plan 15) solo pinta
 * el `TodayCardModel`.
 *
 * Precedencia de gates (de arriba hacia abajo, gana el primero que aplica):
 *
 *  0. `hasPlan` = suscripción active/paused O `planStatus.hasActivePlan` (respaldo:
 *     si la suscripción no vino pero el plan-status dice que hay plan, NUNCA es
 *     "sin plan"). Sin plan y `planLoading` → `cargando` (estado neutro; ningún
 *     gate de "sin plan" se decide mientras algo carga).
 *  1. Sin plan (y nada cargando):
 *     a. plan programado (`subscription.status === 'scheduled'` o
 *        `planStatus.hasScheduledPlan`) → `plan-programado` (el socio ya renovó;
 *        no se le dice "Renová tu plan");
 *     b. sede virtual → `online-libre` (con "Ver planes");
 *     c. `planStatus.hadPlan` → `sin-plan-vencio`;
 *     d. si no (incluye `planStatus` null por error de red, fail-open) → `sin-plan-nunca`.
 *  2. Con plan: sesión de hoy completada → `completada`.
 *  3. Con plan, virtual: con programa → domingo (en la zona de la sede) o
 *     (`weekLoaded` y sin sesión hoy) → `descanso` (variante online); si no →
 *     `online-programa`. Sin programa → `online-libre`, TODOS los días.
 *  4. Con plan, presencial: reserva de hoy → `presencial-turno`; sin reserva y
 *     (domingo o (`weekLoaded` y sin sesión hoy)) → `descanso`; si no →
 *     `presencial-sin-turno` (con variante de lista de espera).
 *
 * Guarda de semana cargada: "sin sesión hoy" solo cuenta como descanso si
 * `weekLoaded` (el fetch de la semana terminó OK). El domingo es descanso aunque
 * la semana no haya cargado.
 *
 * El QR de check-in NO se decide acá: su única fuente de verdad es
 * `useTodayBookingStore.fabVisible`. La card solo informa la ventana con chips.
 */

import type { MemberPlanStatus } from 'src/types/plan-status'

export type TodayCardKind =
  | 'cargando'
  | 'presencial-turno'
  | 'presencial-sin-turno'
  | 'descanso'
  | 'completada'
  | 'online-programa'
  | 'online-libre'
  | 'sin-plan-nunca'
  | 'sin-plan-vencio'
  | 'plan-programado'

/** Texto en tramos: permite resaltar ("Tu turno: **19:00**") sin HTML. */
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
  todayRoute: string | null
  tomorrowRoute: string | null
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
  checkInMessage: string | null
  trialEligible: boolean
  /** El fetch de la semana terminó OK. */
  weekLoaded: boolean
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

function addDays(dateStr: string, days: number): string {
  const base = utcMidnight(dateStr)
  if (base === null) return dateStr
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10)
}

const DAY_KICKER_FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
})
const LONG_DATE_FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
})

/** "2026-10-15" → "Hoy · jueves 15". */
export function formatDayKicker(todayStr: string): string {
  const ms = utcMidnight(todayStr)
  if (ms === null) return 'Hoy'
  return `Hoy · ${DAY_KICKER_FMT.format(ms)}`
}

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

// ── Piezas reutilizables ──

const PLANES: TodayCardAction = { label: 'Ver planes', to: '/planes' }
const OPEN_PROGRAM: TodayCardAction = { label: 'Mi programa', action: 'open-program' }

function messageChip(message: string | null): TodayCardChip[] {
  return message ? [{ icon: 'self_improvement', text: message, tone: 'neutral' }] : []
}

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

function tomorrowMeta(route: string, suffix: string): TodayCardText {
  const parts: TodayCardText = [{ text: 'Mañana: ' }, { text: route, strong: true }]
  if (suffix) parts.push({ text: suffix })
  return parts
}

function hookFor(input: TodayCardInput): TodayCardText | null {
  if (input.isVirtual || !input.todayRoute) return null
  return [
    { text: `Hoy en ${shortBranchName(input.branchName)} se entrena ` },
    { text: input.todayRoute, strong: true },
  ]
}

// ── Gates ──

function planProgramado(input: TodayCardInput): TodayCardModel {
  const startDate =
    input.subscription?.status === 'scheduled'
      ? input.subscription.startDate
      : (input.planStatus?.scheduledStartDate ?? null)
  const planName = input.subscription?.status === 'scheduled' ? input.subscription.planName : null
  return emptyModel(
    'plan-programado',
    'Tu plan',
    startDate && parseYmd(startDate)
      ? `Arranca el ${formatLongDate(startDate)}`
      : 'Tu plan ya está programado',
    {
      meta: planName
        ? [{ text: planName }]
        : [{ text: 'Ya renovaste: te avisamos cuando arranque.' }],
      primary: PLANES,
    },
  )
}

function onlineLibre(input: TodayCardInput, hasPlan: boolean): TodayCardModel {
  return emptyModel('online-libre', 'Hoy', input.todayRoute ?? 'Sesión libre', {
    chips: messageChip(input.checkInMessage),
    primary: { label: 'Entrenar', to: '/training' },
    secondary: hasPlan ? null : PLANES,
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
  return emptyModel(
    'completada',
    formatDayKicker(input.todayStr),
    input.todayRoute ?? 'Sesión completada',
    {
      chips: [{ icon: 'check_circle', text: parts.join(' · '), tone: 'ok' }],
      primary: { label: 'Ver resumen', to: { name: 'session-summary' } },
    },
  )
}

function descansoOnline(input: TodayCardInput): TodayCardModel {
  const hasTomorrow = input.tomorrowRoute !== null
  return emptyModel('descanso', formatDayKicker(input.todayStr), 'Hoy descansás', {
    meta: input.tomorrowRoute ? tomorrowMeta(input.tomorrowRoute, '') : null,
    chips: messageChip(input.checkInMessage),
    primary: hasTomorrow ? { label: 'Ver la de mañana', to: '/training' } : OPEN_PROGRAM,
    secondary: hasTomorrow ? OPEN_PROGRAM : null,
  })
}

function descansoPresencial(input: TodayCardInput): TodayCardModel {
  const tomorrow = addDays(input.todayStr, 1)
  let suffix = ''
  if (input.nextBooking && input.nextBooking.date === tomorrow) {
    suffix = ` · tu turno ${hhmm(input.nextBooking.time)} · ${shortBranchName(input.nextBooking.branchName)}`
  }
  const hasTomorrow = input.tomorrowRoute !== null
  return emptyModel('descanso', formatDayKicker(input.todayStr), 'Hoy descansás', {
    meta: input.tomorrowRoute ? tomorrowMeta(input.tomorrowRoute, suffix) : null,
    primary: hasTomorrow
      ? { label: 'Ver la de mañana', to: '/training' }
      : { label: 'Reservá tu turno', to: '/reservas' },
    secondary: hasTomorrow ? { label: 'Mis turnos', to: '/reservas' } : null,
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
      chips: messageChip(input.checkInMessage),
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
  } else if (input.windowState === 'after') {
    // L35: reserva de hoy con la ventana ya cerrada y sin asistencia. No es "próxima
    // clase" ni se ofrece marcar asistencia (el QR lo decide fabVisible, no la card).
    chips.push({ icon: 'schedule', text: 'Tu clase ya pasó', tone: 'neutral' })
  }
  chips.push(...messageChip(input.checkInMessage))

  const passed = input.windowState === 'after' && !input.attendanceMarkedAt
  const branch = shortBranchName(booking.branchName)
  return emptyModel(
    'presencial-turno',
    formatDayKicker(input.todayStr),
    input.todayRoute ?? booking.activityName,
    {
      meta: [
        { text: passed ? 'Tu turno fue: ' : 'Tu turno: ' },
        { text: hhmm(booking.time), strong: true },
        { text: ` · ${branch}` },
      ],
      chips,
      primary: { label: 'Ver la sesión', to: '/training' },
      secondary: passed
        ? { label: 'Mis turnos', to: '/reservas' }
        : { label: 'Cambiar turno', to: '/reservas' },
    },
  )
}

function presencialSinTurno(input: TodayCardInput): TodayCardModel {
  const meta: TodayCardText = input.waitlistTime
    ? [{ text: `Estás en lista de espera · ${hhmm(input.waitlistTime)}` }]
    : [{ text: 'No tenés turno hoy' }]
  return emptyModel(
    'presencial-sin-turno',
    formatDayKicker(input.todayStr),
    input.todayRoute ?? 'Tu sesión de hoy',
    {
      meta,
      chips: messageChip(input.checkInMessage),
      primary: { label: 'Reservá tu turno', to: '/reservas' },
      secondary: { label: 'Ver la sesión', to: '/training' },
    },
  )
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

  // 0. Nada de "sin plan" mientras algo carga.
  if (!hasPlan && input.planLoading) {
    return emptyModel('cargando', formatDayKicker(input.todayStr), '')
  }

  // 1. Sin plan activo.
  if (!hasPlan) {
    if (input.subscription?.status === 'scheduled' || input.planStatus?.hasScheduledPlan === true) {
      return planProgramado(input)
    }
    if (input.isVirtual) return onlineLibre(input, false)
    if (input.planStatus?.hadPlan === true) return sinPlanVencio(input)
    return sinPlanNunca(input)
  }

  // 2. Sesión de hoy completada.
  if (input.todayCompleted) return withExtraPrograms(completada(input), input)

  const isSunday = input.dow === 7
  const noSessionToday = input.weekLoaded && input.todayRoute === null

  // 3. Virtual.
  if (input.isVirtual) {
    if (!input.program) return onlineLibre(input, true)
    if (isSunday || noSessionToday) return descansoOnline(input)
    return onlinePrograma(input, input.program)
  }

  // 4. Presencial.
  if (input.booking) return withExtraPrograms(presencialTurno(input, input.booking), input)
  if (isSunday || noSessionToday) return withExtraPrograms(descansoPresencial(input), input)
  return withExtraPrograms(presencialSinTurno(input), input)
}
