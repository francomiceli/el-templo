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
 * Fase 203 (D-05..D-08, D-18): dos reglas mandan sobre todo lo de abajo.
 *  - "Una falla es 'no sé', nunca 'no'": las banderas `*Failed` sin dato previo sacan a la card
 *    del esqueleto AL INSTANTE (un pedido que falló no va a llegar más tarde) mostrando `neutral`
 *    o solo lo que se sabe. Nunca "Arrancá tu plan", "Reservá tu clase", "Sesión libre" ni
 *    "completada" por una falla. Una falla con dato previo conservado (turno, programa) no
 *    bloquea: se muestra el dato.
 *  - El tope (`deadlinePassed`, D-07) es SOLO para lo que tarda (banderas `*Loading`): vencido,
 *    la card usa lo que sabe y vuelve sola al modelo completo cuando llega el dato.
 *
 * Precedencia de gates (de arriba hacia abajo, gana el primero que aplica). Fuente: UAT
 * D3/D4/D5/D11 y confirmaciones C1/C2 de Franco (la card nunca le dice al socio que frene):
 *
 * -1. `profileLoading` → `cargando` SIEMPRE, con o sin tope: D-08 manda sobre D-07/D-18 para el
 *     perfil. Sin perfil no se conoce la zona de la sede (`todayStr`) ni si es presencial o
 *     virtual; `neutral` solo se alcanza con perfil.
 *  0. `hasPlan` = suscripción active/paused O `planStatus.hasActivePlan` (respaldo: si la
 *     suscripción no vino pero el plan-status dice que hay plan, NUNCA es "sin plan").
 *     `hasScheduled` = suscripción `scheduled` O `planStatus.hasScheduledPlan` (D4: un plan
 *     programado se trata igual que uno activo). `canTrain = hasPlan || hasScheduled`.
 *     Sin `canTrain`: `planFailed` → `neutral` al instante (no se sabe si hay plan, si venció
 *     ni si hay uno programado); `planLoading` → `cargando` hasta el tope y `neutral` después
 *     (ningún gate de "sin plan" se decide mientras algo carga ni sin saber).
 *  1. Sin `canTrain` (y nada cargando): sede virtual → `online-libre` (con "Ver planes");
 *     `planStatus.hadPlan` → `sin-plan-vencio`; si no (incluye `planStatus` null sin falla)
 *     → `sin-plan-nunca`. Virtual espera la semana (`weekLoading`, el título usa la rutina) y
 *     "nunca tuvo plan" espera la prueba gratis (`trialLoading`) hasta el tope; vencido el
 *     tope, `sin-plan-nunca` sale sin la secundaria "Clase de prueba gratis".
 * 1.5. Con plan: `cargando` mientras falte la semana, el programa, las stats o (presencial,
 *     sin turno en memoria y sin sesión hecha) las reservas, hasta el tope. SOLO cuentan las
 *     banderas `*Loading`, nunca las `*Failed`.
 *  2. Sesión de hoy completada → `completada` (solo con stats resueltas y sin falla).
 *  3. Virtual: con programa → `online-programa` SIEMPRE (domingo y días sin sesión
 *     incluidos, D3); sin programa → `online-libre` con "Entrenar" y sin "Ver planes".
 *     Programa desconocido (cargando tras el tope, o falla sin programa) → `neutral`.
 *  4. Presencial:
 *     - D5: una clase de hoy con la ventana cerrada (`windowState === 'after'`) y sin
 *       asistencia se trata como si no existiera;
 *     a. clase de hoy vigente → `presencial-turno`;
 *     b. reservas todavía cargando (`bookingsLoading`) → `cargando` (no se afirma que
 *        falta reservar por una carrera; vencido el tope → `neutral`); reservas que
 *        fallaron (`bookingsFailed`) sin turno vigente → `neutral` al instante;
 *     c. lista de espera de hoy → `presencial-sin-turno` (variante lista de espera);
 *     d. próxima clase reservada (`nextBooking`) → `presencial-proxima` (C1);
 *     e. si no → `presencial-sin-turno` con "Reservá tu clase" (C2, cualquier día).
 *
 * Alto fijo (fase 197, sketch 017): la card tiene SIEMPRE las mismas 4 filas (kicker, título de
 * 2 líneas, línea de estado, una fila de acciones), así que el modelo respeta dos reglas:
 *  - Línea de estado: o `pill` (estado: asistencia, ventana de la clase, completada) o `meta`
 *    (texto), nunca las dos. Si hay `pill`, `meta` va null.
 *  - Un solo link por card (`secondary`), con prioridad: link a Libre > el `secondary` propio
 *    del gate > "Tus programas".
 *
 * Fase 197 D-17: el link "Probá el modo Libre" REEMPLAZA a `secondary` sobre el modelo ya
 * resuelto (`withLibreLink`), sin tocar ningún otro campo de los gates. Criterio conservador
 * (ante la duda NO se muestra): solo con plan active/paused (un plan solo programado no) y
 * (a) `completada`, (b) `presencial-turno` con asistencia registrada, (c) `presencial-sin-turno`
 * sin lista de espera (incluye la clase de hoy perdida, regla D5), (d) `presencial-proxima`
 * (hoy no hay clase), (e) `online-libre` sin plani hoy (`todayRoute` null). Nunca antes de la clase.
 * Con `libreEnabled` en false (FREE_BLOCKS_ENABLED apagado) no se pone nunca.
 * `online-programa` nunca: su link es "Mi programa", que para quien sigue un programa pesa más.
 * Después va `withExtraPrograms`: pone "Tus programas" en `secondary` solo si quedó vacío
 * (completada y presenciales, nunca virtual ni sin plan).
 *
 * El QR de check-in NO se decide acá: su única fuente de verdad es
 * `useTodayBookingStore.fabVisible`. La card solo informa la ventana con una pill.
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
  /** Fase 203 (D-18): no se sabe lo suficiente para afirmar un estado (falla o tope vencido). */
  | 'neutral'

/** Texto en tramos: permite resaltar ("Tu clase: **19:00**") sin HTML. */
export type TodayCardText = { text: string; strong?: boolean }[]

export interface TodayCardAction {
  label: string
  to?: string | { name: string }
  action?: 'open-program'
}

/** Estado de la card (asistencia, ventana de la clase, completada): ocupa la línea de estado. */
export interface TodayCardPill {
  icon: string
  tone: 'neutral' | 'ok'
  text: TodayCardText
}

export interface TodayCardModel {
  kind: TodayCardKind
  kicker: string
  title: string
  /** Texto de la línea de estado. Si hay `pill`, ocupa esa línea y `meta` va null. */
  meta: TodayCardText | null
  pill: TodayCardPill | null
  /** 0..1 o null (sin barra). */
  progress: number | null
  /** null solo en `cargando`. */
  primary: TodayCardAction | null
  /** El único link de la fila de acciones (ver prioridad en el docblock del archivo). */
  secondary: TodayCardAction | null
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
  /**
   * Hay resumen de la clase presencial de hoy (`progressionStore.todayPresencial`, espejo del
   * check-in). El check-in Wellhub del profe no lo genera: sin resumen no se ofrece "Repetir sesión".
   */
  presencialSummary: boolean
  waitlistTime: string | null
  /**
   * Plani de hoy si existe; si no, la del próximo día cargado con sesión (ver `pickNextRoute`).
   * Solo la usa `presencial-sin-turno` ("Próxima: <plani>"); null → respaldo "Elegí día, horario y sede".
   */
  nextRoute: string | null
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
  /** FREE_BLOCKS_ENABLED: apagado, nunca se pone el link a Libre (queda el `secondary` del gate) */
  libreEnabled: boolean
  /**
   * Fase 203 (D-08): sesión sin perfil (el boot no lo trajo). Sin perfil no se sabe si el socio
   * es presencial o virtual ni la zona de la sede (`todayStr`). Deja la card en esqueleto AUN con
   * el tope vencido: lo resuelve el reintento del perfil.
   */
  profileLoading: boolean
  /** `/sessions/weekly` no respondió todavía (tras un error cuenta como respondido). */
  weekLoading: boolean
  /** my-progress + inscripciones no resolvieron por primera vez (`!userStore.memberStateLoaded`). */
  programLoading: boolean
  /** trial-eligibility no resolvió. Solo importa sin plan y no virtual. */
  trialLoading: boolean
  /** `/progression/stats` no resolvió por primera vez. */
  statsLoading: boolean
  /**
   * La suscripción o el plan-status fallaron por red y `planStatus` es null: no se sabe si hay
   * plan, si venció ni si hay uno programado.
   */
  planFailed: boolean
  /**
   * La última carga de my-bookings falló. `booking` trae el último dato bueno si lo había: solo
   * cuenta como "no sé" cuando no hay turno vigente.
   */
  bookingsFailed: boolean
  /**
   * Falló my-progress o current-program/enrollments. `program` trae el último dato bueno si lo
   * había: solo cuenta como "no sé" cuando `program` es null.
   */
  programFailed: boolean
  /** Las stats fallaron y no hay stats previas: no se sabe si hoy está completada. */
  statsFailed: boolean
  /** Venció el tope de carga (D-07): lo que sigue cargando deja de bloquear la card. */
  deadlinePassed: boolean
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

/** "El Templo Moreno" → "Sede Moreno": en la card de hoy "Moreno" solo no se entendía (2026-10-18). */
function sedeLabel(name: string): string {
  return `Sede ${shortBranchName(name)}`
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

/**
 * Plani a mostrar en "Próxima: …": la de HOY si tiene nombre; si no, la del primer día
 * posterior a hoy (orden cronológico) con plani. PURA: `routeByDate` es fecha "YYYY-MM-DD"
 * → nombre de la plani (null si ese día no tiene sesión). Las fechas anteriores a hoy se ignoran.
 */
export function pickNextRoute(
  todayStr: string,
  routeByDate: ReadonlyMap<string, string | null>,
): string | null {
  const today = routeByDate.get(todayStr)
  if (today) return today
  const later = [...routeByDate.keys()].filter((d) => d > todayStr).sort()
  for (const date of later) {
    const name = routeByDate.get(date)
    if (name) return name
  }
  return null
}

// ── Piezas reutilizables ──

const PLANES: TodayCardAction = { label: 'Ver planes', to: '/planes' }
const OPEN_PROGRAM: TodayCardAction = { label: 'Mi programa', action: 'open-program' }
// Fase 197 D-17: abre Entrenar directo en la tab Libre (EntrenarView lee `query.tab === 'libre'`).
const LIBRE_LINK: TodayCardAction = { label: 'Probá el modo Libre', to: '/training?tab=libre' }

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
    pill: null,
    progress: null,
    primary: null,
    secondary: null,
    ...over,
  }
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
    // Corte de línea a mano (`white-space: pre-line` en TodayCard), igual que "Reservá\ntu clase".
    'Renová\ntu plan',
    {
      meta: [{ text: meta }],
      primary: { label: 'Renovar', to: '/planes' },
      secondary: { label: 'Ver otros planes', to: '/planes' },
    },
  )
}

function sinPlanNunca(input: TodayCardInput): TodayCardModel {
  return emptyModel('sin-plan-nunca', 'Empezá hoy', 'Arrancá tu plan', {
    meta: [{ text: 'Elegí cómo querés entrenar: en tu sede o online.' }],
    primary: PLANES,
    secondary: input.trialEligible ? { label: 'Clase de prueba gratis', to: '/reservas' } : null,
  })
}

/**
 * Fase 203 (D-18): estado neutral. Mismo marco que el resto, sin pill, solo la fecha de la sede y
 * "Entrenar". Se alcanza únicamente con perfil (G-1 corta antes), así que `todayStr` ya está en la
 * zona real de la sede y la fecha siempre se conoce.
 */
function neutral(input: TodayCardInput): TodayCardModel {
  return emptyModel('neutral', 'Hoy', 'Tu entrenamiento', {
    meta: [{ text: formatLongDate(input.todayStr) }],
    primary: { label: 'Entrenar', to: '/training' },
  })
}

function completada(input: TodayCardInput): TodayCardModel {
  const session = input.todaySession
  const parts = ['Completada']
  if (session?.durationMinutes != null) parts.push(`${session.durationMinutes} min`)
  if (session?.rpe != null) parts.push(`RPE ${session.rpe}`)
  return emptyModel('completada', KICKER_COMPLETADA, input.todayRoute ?? 'Sesión completada', {
    pill: { icon: 'check_circle', tone: 'ok', text: [{ text: parts.join(' · ') }] },
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
  const branch = sedeLabel(booking.branchName)
  // La línea de estado es la pill (asistencia / ventana abierta) o, si no hay estado que
  // informar, el texto "Tu clase: HH:mm · Sede X". Nunca las dos.
  let pill: TodayCardPill | null = null
  let meta: TodayCardText | null = [
    { text: 'Tu clase: ' },
    { text: hhmm(booking.time), strong: true },
    { text: ` · ${branch}` },
  ]
  if (input.attendanceMarkedAt) {
    pill = {
      icon: 'check_circle',
      tone: 'ok',
      text: [
        { text: 'Asistencia registrada ' },
        { text: input.attendanceMarkedAt, strong: true },
        { text: ` · ${branch}` },
      ],
    }
    meta = null
  } else if (input.windowState === 'open') {
    const min = input.minutesToStart
    pill = {
      icon: 'schedule',
      tone: 'neutral',
      text:
        min !== null && min > 0
          ? [
              { text: 'Empieza en ' },
              { text: `${min} min`, strong: true },
              { text: ` · ${branch}` },
            ]
          : [{ text: `Tu clase ya empezó · ${branch}` }],
    }
    meta = null
  }

  // Con la asistencia registrada ya no hay clase que cambiar; el resumen de la presencial ofrece
  // hacer la sesión de hoy también en la app.
  const attended = input.attendanceMarkedAt !== null
  return emptyModel('presencial-turno', KICKER_TURNO, input.todayRoute ?? booking.activityName, {
    meta,
    pill,
    primary:
      attended && input.presencialSummary
        ? { label: 'Repetir sesión', to: { name: 'session-summary' } }
        : { label: 'Ver la sesión', to: '/training' },
    secondary: attended ? null : { label: 'Cambiar clase', to: '/reservas' },
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
      meta: [{ text: sedeLabel(next.branchName) }],
      primary: { label: 'Mis clases', to: '/reservas' },
      secondary: { label: 'Cambiar clase', to: '/reservas' },
    },
  )
}

/** C2: sin ninguna clase reservada, cualquier día, la card invita a reservar. */
function presencialSinTurno(input: TodayCardInput): TodayCardModel {
  const meta: TodayCardText = input.waitlistTime
    ? [{ text: `Estás en lista de espera · ${hhmm(input.waitlistTime)}` }]
    : input.nextRoute
      ? [{ text: 'Próxima: ' }, { text: input.nextRoute, strong: true }]
      : [{ text: 'Elegí día, horario y sede' }]
  // Corte de línea a mano (`white-space: pre-line` en TodayCard): "Reservá" / "tu clase",
  // no "Reservá tu" / "clase" (2026-10-18).
  return emptyModel('presencial-sin-turno', KICKER_SIN_TURNO, 'Reservá\ntu clase', {
    meta,
    primary: { label: 'Reservar', to: '/reservas' },
    secondary: null,
  })
}

/**
 * "Tus programas" en el único link, solo si ningún otro lo ocupa (se aplica DESPUÉS de
 * `withLibreLink`). Solo en `completada` y los `presencial-*`; nunca virtual ni sin plan.
 */
function withExtraPrograms(model: TodayCardModel, input: TodayCardInput): TodayCardModel {
  if (!input.hasExtraPrograms || input.isVirtual || model.secondary !== null) return model
  switch (model.kind) {
    case 'completada':
    case 'presencial-turno':
    case 'presencial-proxima':
    case 'presencial-sin-turno':
      return { ...model, secondary: { label: 'Tus programas', action: 'open-program' } }
    default:
      return model
  }
}

/** Plan active/paused, o el plan-status dice que hay plan (respaldo). Un plan solo programado NO cuenta. */
function hasCurrentPlan(input: TodayCardInput): boolean {
  return (
    input.subscription?.status === 'active' ||
    input.subscription?.status === 'paused' ||
    input.planStatus?.hasActivePlan === true
  )
}

/**
 * Fase 197 D-17: pone el link a Libre (en lugar del `secondary` del gate) solo "después de la
 * clase o en días sin clase". Criterio conservador: ver el docblock del archivo. Cualquier otro
 * caso devuelve el modelo intacto.
 */
function withLibreLink(model: TodayCardModel, input: TodayCardInput): TodayCardModel {
  if (!input.libreEnabled || !hasCurrentPlan(input)) return model
  let show = false
  switch (model.kind) {
    case 'completada':
    case 'presencial-proxima':
      show = true
      break
    case 'presencial-turno':
      show = input.attendanceMarkedAt !== null
      break
    case 'presencial-sin-turno':
      show = !input.waitlistTime
      break
    case 'online-libre':
      show = !input.todayRoute
      break
    default:
      show = false
  }
  return show ? { ...model, secondary: LIBRE_LINK } : model
}

// El orden importa: Libre primero (reemplaza al secondary), "Tus programas" solo si quedó libre.
export function resolveTodayCard(input: TodayCardInput): TodayCardModel {
  return withExtraPrograms(withLibreLink(resolveBaseCard(input), input), input)
}

function resolveBaseCard(input: TodayCardInput): TodayCardModel {
  // -1. Sin perfil no hay zona de la sede ni presencial/virtual: esqueleto aun con el tope (D-08).
  if (input.profileLoading) return emptyModel('cargando', '', '')

  const hasPlan = hasCurrentPlan(input)
  const hasScheduled =
    input.subscription?.status === 'scheduled' || input.planStatus?.hasScheduledPlan === true
  const canTrain = hasPlan || hasScheduled

  // 0. Nada de "sin plan" mientras algo carga ni sin saber: una falla sale enseguida (neutral),
  // lo que tarda espera hasta el tope.
  if (!canTrain && input.planFailed) return neutral(input)
  if (!canTrain && input.planLoading) {
    return input.deadlinePassed ? neutral(input) : emptyModel('cargando', '', '')
  }

  // 1. Sin plan (ni programado).
  if (!canTrain) {
    if (input.isVirtual) {
      if (input.weekLoading && !input.deadlinePassed) return emptyModel('cargando', '', '')
      return onlineLibre(input, false)
    }
    if (input.planStatus?.hadPlan === true) return sinPlanVencio(input)
    // "Clase de prueba gratis" depende de la elegibilidad: se espera hasta el tope y, vencido,
    // sale sin esa secundaria (omitir no es afirmar).
    if (input.trialLoading) {
      if (!input.deadlinePassed) return emptyModel('cargando', '', '')
      return sinPlanNunca({ ...input, trialEligible: false })
    }
    return sinPlanNunca(input)
  }

  // 1.5. Con plan: se espera lo que todavía puede llegar (solo `*Loading`, nunca `*Failed`).
  // Con un turno en memoria o la sesión ya hecha no se espera por las reservas.
  const waitingBookings =
    !input.isVirtual && input.bookingsLoading && input.booking === null && !input.todayCompleted
  const waiting = input.weekLoading || input.statsLoading || input.programLoading || waitingBookings
  if (waiting && !input.deadlinePassed) return emptyModel('cargando', '', '')

  // 2. Sesión de hoy completada. Sin stats resueltas no se afirma.
  if (!input.statsLoading && !input.statsFailed && input.todayCompleted) return completada(input)

  // 3. Virtual: siempre se puede entrenar. Sin saber el programa no se dice "Sesión libre".
  if (input.isVirtual) {
    if (input.program) return onlinePrograma(input, input.program)
    if (input.programLoading || input.programFailed) return neutral(input)
    return onlineLibre(input, true)
  }

  // 4. Presencial. D5: una clase de hoy ya pasada y sin asistencia es como si no existiera.
  const missedToday =
    input.booking !== null && input.windowState === 'after' && input.attendanceMarkedAt === null
  const activeBooking = missedToday ? null : input.booking
  if (activeBooking) return presencialTurno(input, activeBooking)
  // Sin saber si hay clase hoy no se decide "reservá" (A1 del plan 20): ni cargando (tras el
  // tope, neutral) ni con la carga fallida (neutral enseguida).
  if (input.bookingsLoading) {
    return input.deadlinePassed ? neutral(input) : emptyModel('cargando', '', '')
  }
  if (input.bookingsFailed) return neutral(input)
  if (input.waitlistTime) return presencialSinTurno(input)
  if (input.nextBooking) return presencialProxima(input, input.nextBooking)
  return presencialSinTurno(input)
}
