import { describe, it, expect } from 'vitest'
import {
  resolveTodayCard,
  formatLongDate,
  formatNextClassTitle,
  shortBranchName,
  type TodayCardInput,
  type TodayCardModel,
} from '../today-card'
import type { MemberPlanStatus } from 'src/types/plan-status'

const ACTIVE_SUB = { status: 'active', planName: 'Pase Libre', startDate: '2026-10-01' }

function planStatus(over: Partial<MemberPlanStatus> = {}): MemberPlanStatus {
  return {
    hasActivePlan: false,
    hasScheduledPlan: false,
    scheduledStartDate: null,
    hadPlan: false,
    lastPlan: null,
    ...over,
  }
}

// Jueves 2026-10-15, presencial en El Templo Alem, plan activo, ruta "Muscle Up".
function baseInput(over: Partial<TodayCardInput> = {}): TodayCardInput {
  return {
    todayStr: '2026-10-15',
    dow: 4,
    firstName: 'Andre',
    branchName: 'El Templo Alem',
    isVirtual: false,
    subscription: ACTIVE_SUB,
    planStatus: null,
    planLoading: false,
    bookingsLoading: false,
    todayRoute: 'Muscle Up',
    todayCompleted: false,
    todaySession: null,
    booking: null,
    windowState: null,
    minutesToStart: null,
    attendanceMarkedAt: null,
    waitlistTime: null,
    nextBooking: null,
    program: null,
    hasExtraPrograms: false,
    trialEligible: false,
    ...over,
  }
}

const BOOKING = {
  time: '19:00',
  branchName: 'El Templo Alem',
  activityName: 'Calistenia',
  status: 'reservado',
}

const NEXT_MONDAY = { date: '2026-10-19', time: '19:00', branchName: 'El Templo Alem' }

// Lunes 12 .. domingo 18 de octubre de 2026 (día de la semana coherente con el calendario).
const DAYS = [
  { todayStr: '2026-10-12', dow: 1 },
  { todayStr: '2026-10-13', dow: 2 },
  { todayStr: '2026-10-14', dow: 3 },
  { todayStr: '2026-10-15', dow: 4 },
  { todayStr: '2026-10-16', dow: 5 },
  { todayStr: '2026-10-17', dow: 6 },
  { todayStr: '2026-10-18', dow: 7 },
]

const PROGRAM = {
  programName: 'Calistenia Online',
  currentWeek: 3,
  durationWeeks: 12,
  sessionsCompletedThisWeek: 1,
  sessionsPerWeekToAdvance: 3,
}

function flat(text: TodayCardModel['meta']): string {
  return (text ?? []).map((t) => t.text).join('')
}

function allCopy(m: TodayCardModel): string {
  return [
    m.kicker,
    m.title,
    flat(m.meta),
    flat(m.hook),
    m.primary?.label ?? '',
    m.secondary?.label ?? '',
    m.tertiary?.label ?? '',
    ...m.chips.map((c) => c.text),
  ].join(' | ')
}

describe('resolveTodayCard — carga (nunca un gate de "sin plan" por una carrera)', () => {
  it('sin suscripción ni plan-status y cargando → cargando, neutro y sin acciones', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: null, planLoading: true }),
    )
    expect(m.kind).toBe('cargando')
    expect(m.kicker).toBe('')
    expect(m.title).toBe('')
    expect(m.meta).toBeNull()
    expect(m.chips).toEqual([])
    expect(m.progress).toBeNull()
    expect(m.primary).toBeNull()
    expect(m.secondary).toBeNull()
    expect(m.tertiary).toBeNull()
    expect(m.hook).toBeNull()
    const copy = allCopy(m)
    expect(copy).not.toContain('Arrancá tu plan')
    expect(copy).not.toContain('Renová tu plan')
    expect(copy).not.toContain('Ver planes')
  })

  it('socio virtual cargando → cargando (no cae en online-libre con "Ver planes")', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, subscription: null, planStatus: null, planLoading: true }),
    )
    expect(m.kind).toBe('cargando')
    expect(allCopy(m)).not.toContain('Ver planes')
  })

  it('cargando con plan-status que dice hadPlan → igual cargando (no decide "venció")', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hadPlan: true }),
        planLoading: true,
      }),
    )
    expect(m.kind).toBe('cargando')
  })

  it('suscripción activa + planLoading true → no espera nada: gate normal de presencial', () => {
    const m = resolveTodayCard(baseInput({ planLoading: true }))
    expect(m.kind).toBe('presencial-sin-turno')
  })

  it('suscripción pausada + planLoading true → con plan', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: { ...ACTIVE_SUB, status: 'paused' }, planLoading: true }),
    )
    expect(m.kind).toBe('presencial-sin-turno')
  })
})

describe('resolveTodayCard — reservas de hoy todavía cargando (A1)', () => {
  it('presencial con plan, sin reserva en memoria y bookingsLoading → cargando (no afirma que falte reservar)', () => {
    const m = resolveTodayCard(baseInput({ bookingsLoading: true }))
    expect(m.kind).toBe('cargando')
    expect(m.primary).toBeNull()
    expect(flat(m.meta)).toBe('')
  })

  it('domingo con bookingsLoading → cargando (puede tener clase)', () => {
    const m = resolveTodayCard(baseInput({ dow: 7, todayRoute: null, bookingsLoading: true }))
    expect(m.kind).toBe('cargando')
  })

  it('con reserva ya en memoria la clase gana aunque bookingsLoading siga true', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING, bookingsLoading: true }))
    expect(m.kind).toBe('presencial-turno')
  })

  it('al terminar de cargar sin reserva → presencial-sin-turno (Reservá tu clase)', () => {
    const m = resolveTodayCard(baseInput({ bookingsLoading: false }))
    expect(m.kind).toBe('presencial-sin-turno')
  })

  it('no afecta al virtual (no usa reservas) ni a la sesión completada', () => {
    expect(
      resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM, bookingsLoading: true }))
        .kind,
    ).toBe('online-programa')
    expect(resolveTodayCard(baseInput({ todayCompleted: true, bookingsLoading: true })).kind).toBe(
      'completada',
    )
  })

  it('sin plan no depende de las reservas: sin-plan-nunca igual', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: null, bookingsLoading: true }),
    )
    expect(m.kind).toBe('sin-plan-nunca')
  })
})

describe('resolveTodayCard — respaldo con plan-status', () => {
  it('suscripción null pero hasActivePlan true → se trata como CON plan (sin reserva)', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasActivePlan: true, hadPlan: false }),
      }),
    )
    expect(m.kind).toBe('presencial-sin-turno')
    expect(allCopy(m)).not.toContain('Arrancá')
  })

  it('suscripción null pero hasActivePlan true y con reserva → presencial-turno', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasActivePlan: true }),
        booking: BOOKING,
      }),
    )
    expect(m.kind).toBe('presencial-turno')
  })

  it('hasActivePlan true y planLoading true → no es cargando', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasActivePlan: true }),
        planLoading: true,
      }),
    )
    expect(m.kind).not.toBe('cargando')
  })
})

describe('resolveTodayCard — presencial con clase hoy', () => {
  it('copy de D-03/D11: kicker, ruta, "Tu clase: 19:00 · Alem", Ver la sesión + Cambiar clase', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING }))
    expect(m.kind).toBe('presencial-turno')
    expect(m.kicker).toBe('Tu clase de hoy')
    expect(m.title).toBe('Muscle Up')
    expect(m.meta).toContainEqual({ text: '19:00', strong: true })
    expect(flat(m.meta)).toBe('Tu clase: 19:00 · Alem')
    expect(m.primary).toEqual({ label: 'Ver la sesión', to: '/training' })
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
  })

  it('sin ruta cargada → el título es la actividad de la reserva', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING, todayRoute: null }))
    expect(m.title).toBe('Calistenia')
  })

  it('ventana abierta con minutesToStart 12 → chip "Tu clase empieza en 12 min"', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: 12 }),
    )
    expect(m.chips).toContainEqual({
      icon: 'schedule',
      text: 'Tu clase empieza en 12 min',
      tone: 'neutral',
    })
  })

  it('ventana abierta con minutesToStart -3 → "Tu clase ya empezó"', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: -3 }),
    )
    expect(m.chips.map((c) => c.text)).toEqual(['Tu clase ya empezó'])
  })

  it('ventana abierta con minutesToStart 0 → "Tu clase ya empezó" (borde)', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: 0 }),
    )
    expect(m.chips.map((c) => c.text)).toEqual(['Tu clase ya empezó'])
  })

  it('ventana "before" → sin chip de ventana', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'before', minutesToStart: 90 }),
    )
    expect(m.chips).toEqual([])
  })

  it('asistencia marcada → chip ok "Asistencia registrada 18:52" y sin chip de ventana', () => {
    const m = resolveTodayCard(
      baseInput({
        booking: BOOKING,
        windowState: 'open',
        minutesToStart: 8,
        attendanceMarkedAt: '18:52',
      }),
    )
    expect(m.chips).toEqual([
      { icon: 'check_circle', text: 'Asistencia registrada 18:52', tone: 'ok' },
    ])
  })

  it('reserva de otra sede → usa el nombre corto de ESA sede', () => {
    const m = resolveTodayCard(
      baseInput({ booking: { ...BOOKING, branchName: 'El Templo Moreno' } }),
    )
    expect(flat(m.meta)).toBe('Tu clase: 19:00 · Moreno')
  })

  it('ventana abierta → solo el chip de la ventana (el consejo del registro vive en el registro)', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: 12 }),
    )
    expect(m.chips.map((c) => c.text)).toEqual(['Tu clase empieza en 12 min'])
  })

  it('día hábil sin sesión hoy pero CON reserva hoy → presencial-turno', () => {
    const m = resolveTodayCard(baseInput({ todayRoute: null, booking: BOOKING }))
    expect(m.kind).toBe('presencial-turno')
  })

  it('domingo con reserva → presencial-turno', () => {
    const m = resolveTodayCard(baseInput({ dow: 7, booking: BOOKING }))
    expect(m.kind).toBe('presencial-turno')
  })

  it('reserva activa + próxima clase → gana la de hoy (presencial-turno)', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING, nextBooking: NEXT_MONDAY }))
    expect(m.kind).toBe('presencial-turno')
  })
})

describe('resolveTodayCard — D5: la clase de hoy ya pasada y sin asistencia no existe', () => {
  const PASADA = { booking: BOOKING, minutesToStart: -45 }

  it('sin próxima clase → "Reservá tu clase" (no "Tu turno fue", no "Tu clase ya pasó")', () => {
    const m = resolveTodayCard(baseInput({ ...PASADA, windowState: 'after' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.title).toBe('Reservá tu clase')
    const copy = allCopy(m)
    expect(copy).not.toContain('Tu turno fue')
    expect(copy).not.toContain('Tu clase ya pasó')
    expect(copy).not.toContain('Mis turnos')
    expect(copy).not.toContain('Tu clase: ')
  })

  it('con próxima clase → presencial-proxima', () => {
    const m = resolveTodayCard(
      baseInput({ ...PASADA, windowState: 'after', nextBooking: NEXT_MONDAY }),
    )
    expect(m.kind).toBe('presencial-proxima')
    expect(m.title).toBe('Lunes 19 · 19:00')
  })

  it('ventana pasada pero CON asistencia → presencial-turno con el chip ok y copy normal', () => {
    const m = resolveTodayCard(
      baseInput({ ...PASADA, windowState: 'after', attendanceMarkedAt: '19:05' }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(m.chips.map((c) => c.text)).toEqual(['Asistencia registrada 19:05'])
    expect(flat(m.meta)).toBe('Tu clase: 19:00 · Alem')
    expect(m.secondary?.label).toBe('Cambiar clase')
  })

  it('ventana abierta sin asistencia → sigue siendo presencial-turno con chip de ventana', () => {
    const m = resolveTodayCard(baseInput({ ...PASADA, windowState: 'open', minutesToStart: 5 }))
    expect(m.kind).toBe('presencial-turno')
    expect(m.chips.map((c) => c.text)).toEqual(['Tu clase empieza en 5 min'])
  })

  it('ventana "before" → sigue siendo presencial-turno', () => {
    const m = resolveTodayCard(baseInput({ ...PASADA, windowState: 'before', minutesToStart: 90 }))
    expect(m.kind).toBe('presencial-turno')
  })

  it('clase pasada + reservas cargando → cargando (la precedencia de A1 se conserva)', () => {
    const m = resolveTodayCard(
      baseInput({ ...PASADA, windowState: 'after', bookingsLoading: true }),
    )
    expect(m.kind).toBe('cargando')
  })

  it('clase pasada + lista de espera → variante lista de espera', () => {
    const m = resolveTodayCard(
      baseInput({ ...PASADA, windowState: 'after', waitlistTime: '20:00' }),
    )
    expect(flat(m.meta)).toBe('Estás en lista de espera · 20:00')
  })
})

describe('resolveTodayCard — presencial: próxima clase (C1)', () => {
  it('domingo con clase el lunes → "Tu próxima clase", "Lunes 19 · 19:00", sede, Mis clases + Cambiar clase', () => {
    const m = resolveTodayCard(
      baseInput({ todayStr: '2026-10-18', dow: 7, todayRoute: null, nextBooking: NEXT_MONDAY }),
    )
    expect(m.kind).toBe('presencial-proxima')
    expect(m.kicker).toBe('Tu próxima clase')
    expect(m.title).toBe('Lunes 19 · 19:00')
    expect(m.meta).toEqual([{ text: 'Alem' }])
    expect(flat(m.meta)).toBe('Alem')
    expect(m.primary).toEqual({ label: 'Mis clases', to: '/reservas' })
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
    expect(m.progress).toBeNull()
    const copy = allCopy(m)
    expect(copy).not.toContain('Ver la sesión')
    expect(copy).not.toMatch(/mañana/i)
  })

  it('día hábil con sesión hoy y clase mañana → fecha y hora, NUNCA "mañana" ni la ruta', () => {
    const m = resolveTodayCard(
      baseInput({
        nextBooking: { date: '2026-10-16', time: '07:30', branchName: 'El Templo Alem' },
      }),
    )
    expect(m.kind).toBe('presencial-proxima')
    expect(m.title).toBe('Viernes 16 · 07:30')
    expect(allCopy(m)).not.toMatch(/mañana/i)
    expect(allCopy(m)).not.toContain('Muscle Up')
  })

  it('clase dentro de una semana → fecha y hora del día correspondiente', () => {
    const m = resolveTodayCard(
      baseInput({
        nextBooking: { date: '2026-10-21', time: '19:00:00', branchName: 'El Templo Alem' },
      }),
    )
    expect(m.title).toBe('Miércoles 21 · 19:00')
  })

  it('la sede sale de la reserva, no de la sede del perfil', () => {
    const m = resolveTodayCard(
      baseInput({
        nextBooking: { date: '2026-10-19', time: '19:00', branchName: 'El Templo Moreno' },
      }),
    )
    expect(flat(m.meta)).toBe('Moreno')
  })

  it('sin chips', () => {
    expect(resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY })).chips).toEqual([])
  })

  it('hasExtraPrograms → tertiary "Tus programas"', () => {
    const m = resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY, hasExtraPrograms: true }))
    expect(m.kind).toBe('presencial-proxima')
    expect(m.tertiary).toEqual({ label: 'Tus programas', action: 'open-program' })
  })

  it('con bookingsLoading y próxima clase, sin reserva de hoy → cargando', () => {
    const m = resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY, bookingsLoading: true }))
    expect(m.kind).toBe('cargando')
  })

  it('la lista de espera de HOY gana sobre una clase futura', () => {
    const m = resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY, waitlistTime: '19:00' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(flat(m.meta)).toBe('Estás en lista de espera · 19:00')
  })
})

describe('resolveTodayCard — presencial sin ninguna clase reservada (C2)', () => {
  it('copy: "Sin clase reservada", "Reservá tu clase", "Elegí día, horario y sede", Reservar y sin secundario', () => {
    const m = resolveTodayCard(baseInput())
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.kicker).toBe('Sin clase reservada')
    expect(m.title).toBe('Reservá tu clase')
    expect(flat(m.meta)).toBe('Elegí día, horario y sede')
    expect(m.primary).toEqual({ label: 'Reservar', to: '/reservas' })
    expect(m.secondary).toBeNull()
  })

  it('es la misma card con o sin sesión hoy', () => {
    const conRuta = resolveTodayCard(baseInput({ todayRoute: 'Muscle Up' }))
    const sinRuta = resolveTodayCard(baseInput({ todayRoute: null }))
    expect(sinRuta).toEqual(conRuta)
  })

  it('domingo: misma card, kicker "Sin clase reservada", sin descanso ni "Ver la sesión"', () => {
    const m = resolveTodayCard(baseInput({ todayStr: '2026-10-18', dow: 7, todayRoute: null }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.kicker).toBe('Sin clase reservada')
    expect(m.title).toBe('Reservá tu clase')
    expect(m.secondary).toBeNull()
    const copy = allCopy(m)
    expect(copy).not.toContain('Entrenar')
    expect(copy).not.toContain('Ver la sesión')
    expect(copy).not.toContain('Ver la de mañana')
    expect(copy).not.toMatch(/mañana/i)
  })

  it('lista de espera → "Estás en lista de espera · 19:00", título y botón igual', () => {
    const m = resolveTodayCard(baseInput({ waitlistTime: '19:00' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.title).toBe('Reservá tu clase')
    expect(flat(m.meta)).toBe('Estás en lista de espera · 19:00')
    expect(m.primary).toEqual({ label: 'Reservar', to: '/reservas' })
    expect(m.secondary).toBeNull()
  })

  it('sin chips', () => {
    expect(resolveTodayCard(baseInput()).chips).toEqual([])
  })

  it('hasExtraPrograms → tertiary "Tus programas"', () => {
    const m = resolveTodayCard(baseInput({ hasExtraPrograms: true }))
    expect(m.tertiary).toEqual({ label: 'Tus programas', action: 'open-program' })
  })

  it('los 7 días de la semana dan la misma card, sin la fecha (ya está en el saludo)', () => {
    const cards = DAYS.map(({ todayStr, dow }) =>
      resolveTodayCard(baseInput({ todayStr, dow, todayRoute: null })),
    )
    expect(new Set(cards.map((m) => m.title))).toEqual(new Set(['Reservá tu clase']))
    expect(new Set(cards.map((m) => m.kicker))).toEqual(new Set(['Sin clase reservada']))
  })
})

describe('resolveTodayCard — completada', () => {
  it('chip ok "Completada · 55 min · RPE 7" y primario session-summary', () => {
    const m = resolveTodayCard(
      baseInput({
        todayCompleted: true,
        todaySession: { durationMinutes: 55, rpe: 7 },
      }),
    )
    expect(m.kind).toBe('completada')
    expect(m.kicker).toBe('Hoy ya entrenaste')
    expect(m.chips).toEqual([
      { icon: 'check_circle', text: 'Completada · 55 min · RPE 7', tone: 'ok' },
    ])
    expect(m.primary).toEqual({ label: 'Ver resumen', to: { name: 'session-summary' } })
  })

  it('omite las partes nulas (sin RPE / sin duración / sin nada)', () => {
    const sinRpe = resolveTodayCard(
      baseInput({ todayCompleted: true, todaySession: { durationMinutes: 40, rpe: null } }),
    )
    expect(sinRpe.chips[0]!.text).toBe('Completada · 40 min')
    const sinMin = resolveTodayCard(
      baseInput({ todayCompleted: true, todaySession: { durationMinutes: null, rpe: 6 } }),
    )
    expect(sinMin.chips[0]!.text).toBe('Completada · RPE 6')
    const nada = resolveTodayCard(baseInput({ todayCompleted: true, todaySession: null }))
    expect(nada.chips[0]!.text).toBe('Completada')
  })

  it('completada gana sobre la reserva de hoy y sobre el domingo', () => {
    expect(resolveTodayCard(baseInput({ todayCompleted: true, booking: BOOKING })).kind).toBe(
      'completada',
    )
    expect(resolveTodayCard(baseInput({ todayCompleted: true, dow: 7 })).kind).toBe('completada')
  })

  it('virtual con programa + completada → completada (antes que descanso)', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, todayCompleted: true, dow: 7 }),
    )
    expect(m.kind).toBe('completada')
  })

  it('sin ruta → título "Sesión completada"', () => {
    const m = resolveTodayCard(baseInput({ todayCompleted: true, todayRoute: null }))
    expect(m.title).toBe('Sesión completada')
  })

  it('sin plan nunca es completada (los gates de plan van primero)', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus(), todayCompleted: true }),
    )
    expect(m.kind).toBe('sin-plan-nunca')
  })
})

describe('resolveTodayCard — online', () => {
  it('online-programa: semana 3 de 12, 1 de 3, progress ≈ 0.333, Entrenar + Mi programa', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM }))
    expect(m.kind).toBe('online-programa')
    expect(m.kicker).toBe('Hoy · Calistenia Online')
    expect(m.title).toBe('Muscle Up')
    expect(flat(m.meta)).toBe('Semana 3 de 12 · 1 de 3 sesiones esta semana')
    expect(m.progress).toBeCloseTo(0.333, 3)
    expect(m.primary).toEqual({ label: 'Entrenar', to: '/training' })
    expect(m.secondary).toEqual({ label: 'Mi programa', action: 'open-program' })
  })

  it('progress se topa en 1 y se omite si el objetivo semanal es 0', () => {
    const sobra = resolveTodayCard(
      baseInput({
        isVirtual: true,
        program: { ...PROGRAM, sessionsCompletedThisWeek: 5 },
      }),
    )
    expect(sobra.progress).toBe(1)
    const sinMeta = resolveTodayCard(
      baseInput({
        isVirtual: true,
        program: { ...PROGRAM, sessionsPerWeekToAdvance: 0, sessionsCompletedThisWeek: 1 },
      }),
    )
    expect(sinMeta.progress).toBeNull()
    expect(flat(sinMeta.meta)).toBe('Semana 3 de 12 · 1 sesión esta semana')
  })

  it('sin durationWeeks → "Semana 3" sin "de N"; sin ruta → título = nombre del programa', () => {
    const m = resolveTodayCard(
      baseInput({
        isVirtual: true,
        todayRoute: null,
        program: { ...PROGRAM, durationWeeks: null },
      }),
    )
    expect(m.title).toBe('Calistenia Online')
    expect(flat(m.meta)).toBe('Semana 3 · 1 de 3 sesiones esta semana')
  })

  it('online-programa sin chips', () => {
    expect(resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM })).chips).toEqual([])
  })

  it('online-libre con plan y sin programa: Entrenar, sin "Ver planes"', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, program: null }))
    expect(m.kind).toBe('online-libre')
    expect(m.primary).toEqual({ label: 'Entrenar', to: '/training' })
    expect(m.secondary).toBeNull()
  })

  it('online-libre con plan en domingo sigue siendo Entrenar (NO descanso)', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: null, dow: 7, todayRoute: null }),
    )
    expect(m.kind).toBe('online-libre')
    expect(m.title).toBe('Sesión libre')
    expect(m.primary?.label).toBe('Entrenar')
  })

  it('virtual SIN plan (ya cargado) → online-libre con "Ver planes", sin "Arrancá tu plan"', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, subscription: null, planStatus: planStatus() }),
    )
    expect(m.kind).toBe('online-libre')
    expect(m.secondary).toEqual({ label: 'Ver planes', to: '/planes' })
    expect(allCopy(m)).not.toContain('Arrancá tu plan')
  })

  it('virtual sin plan que tuvo uno vencido → igual online-libre (D-05 es presencial)', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, subscription: null, planStatus: planStatus({ hadPlan: true }) }),
    )
    expect(m.kind).toBe('online-libre')
  })

  it('virtual + programa + ruta hoy → online-programa', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM }))
    expect(m.kind).toBe('online-programa')
  })
})

describe('resolveTodayCard — online siempre Entrena (D3)', () => {
  it('virtual con programa en domingo → online-programa con Entrenar + Mi programa', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, dow: 7, todayRoute: null }),
    )
    expect(m.kind).toBe('online-programa')
    expect(m.primary).toEqual({ label: 'Entrenar', to: '/training' })
    expect(m.secondary).toEqual({ label: 'Mi programa', action: 'open-program' })
  })

  it('virtual con programa, día hábil sin sesión → online-programa con el nombre del programa', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM, todayRoute: null }))
    expect(m.kind).toBe('online-programa')
    expect(m.title).toBe('Calistenia Online')
    expect(m.primary?.label).toBe('Entrenar')
  })

  it('virtual con programa los 7 días y con/sin sesión → siempre Entrenar', () => {
    for (const { todayStr, dow } of DAYS) {
      for (const todayRoute of ['Muscle Up', null]) {
        const m = resolveTodayCard(
          baseInput({ isVirtual: true, program: PROGRAM, todayStr, dow, todayRoute }),
        )
        expect(m.kind).toBe('online-programa')
        expect(m.primary?.label).toBe('Entrenar')
      }
    }
  })

  it('virtual sin programa en domingo → online-libre, Entrenar y sin "Ver planes"', () => {
    const m = resolveTodayCard(
      baseInput({
        isVirtual: true,
        program: null,
        todayStr: '2026-10-18',
        dow: 7,
        todayRoute: null,
      }),
    )
    expect(m.kind).toBe('online-libre')
    expect(m.primary?.label).toBe('Entrenar')
    expect(allCopy(m)).not.toContain('Ver planes')
  })

  it('virtual con programa: no usa reservas ni nextBooking', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, nextBooking: NEXT_MONDAY, dow: 7 }),
    )
    expect(m.kind).toBe('online-programa')
    expect(allCopy(m)).not.toContain('Mis clases')
  })
})

describe('resolveTodayCard — sin plan (D-05)', () => {
  it('nunca tuvo plan: copy exacto + gancho con la sede y la ruta', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus({ hadPlan: false }) }),
    )
    expect(m.kind).toBe('sin-plan-nunca')
    expect(m.kicker).toBe('Empezá hoy')
    expect(m.title).toBe('Arrancá tu plan')
    expect(flat(m.meta)).toBe('Elegí cómo querés entrenar: en tu sede o online.')
    expect(m.primary).toEqual({ label: 'Ver planes', to: '/planes' })
    expect(m.hook).toEqual([
      { text: 'Hoy en Alem se entrena ' },
      { text: 'Muscle Up', strong: true },
    ])
  })

  it('"Clase de prueba gratis" solo si es trial-eligible', () => {
    const con = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus(), trialEligible: true }),
    )
    expect(con.secondary).toEqual({ label: 'Clase de prueba gratis', to: '/reservas' })
    const sin = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus(), trialEligible: false }),
    )
    expect(sin.secondary).toBeNull()
  })

  it('sin ruta hoy → sin gancho', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus(), todayRoute: null }),
    )
    expect(m.hook).toBeNull()
  })

  it('venció: kicker con nombre, "Renová tu plan", meta con la fecha larga y gancho', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({
          hadPlan: true,
          lastPlan: { planName: 'Pase Libre', endDate: '2026-09-30', status: 'expired' },
        }),
      }),
    )
    expect(m.kind).toBe('sin-plan-vencio')
    expect(m.kicker).toBe('Te extrañamos, Andre')
    expect(m.title).toBe('Renová tu plan')
    expect(flat(m.meta)).toBe('Tu Pase Libre venció el 30 de septiembre.')
    expect(m.primary).toEqual({ label: 'Renovar', to: '/planes' })
    expect(m.secondary).toEqual({ label: 'Ver otros planes', to: '/planes' })
    expect(flat(m.hook)).toBe('Hoy en Alem se entrena Muscle Up')
  })

  it('venció sin nombre de pila → "Te extrañamos"; sin endDate → "terminó."', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        firstName: null,
        planStatus: planStatus({
          hadPlan: true,
          lastPlan: { planName: 'Pase Libre', endDate: null, status: 'expired' },
        }),
      }),
    )
    expect(m.kicker).toBe('Te extrañamos')
    expect(flat(m.meta)).toBe('Tu Pase Libre terminó.')
  })

  it('suscripción vencida (expired) con plan-status hadPlan → sin-plan-vencio', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: { ...ACTIVE_SUB, status: 'expired' },
        planStatus: planStatus({
          hadPlan: true,
          lastPlan: { planName: 'Pase Libre', endDate: '2026-09-30', status: 'expired' },
        }),
      }),
    )
    expect(m.kind).toBe('sin-plan-vencio')
  })

  it('planStatus null (error de red) sin plan y sin cargar → sin-plan-nunca (fail-open)', () => {
    const m = resolveTodayCard(baseInput({ subscription: null, planStatus: null }))
    expect(m.kind).toBe('sin-plan-nunca')
  })
})

describe('resolveTodayCard — plan programado igual que plan activo (D4)', () => {
  const SCHEDULED_SUB = { status: 'scheduled', planName: 'Pase Libre', startDate: '2026-10-20' }

  function sinFechas(m: TodayCardModel): void {
    const copy = allCopy(m)
    expect(copy).not.toContain('Arranca')
    expect(copy).not.toContain('Ver planes')
    expect(copy).not.toContain('Renová')
    expect(copy).not.toContain('Ya renovaste')
    expect(copy).not.toContain('programado')
  }

  it('suscripción scheduled, presencial sin clase → "Reservá tu clase"', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: SCHEDULED_SUB, planStatus: planStatus({ hadPlan: true }) }),
    )
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.title).toBe('Reservá tu clase')
    sinFechas(m)
  })

  it('suscripción scheduled + próxima clase → presencial-proxima', () => {
    const m = resolveTodayCard(baseInput({ subscription: SCHEDULED_SUB, nextBooking: NEXT_MONDAY }))
    expect(m.kind).toBe('presencial-proxima')
    sinFechas(m)
  })

  it('plan vencido + programada solo en plan-status (suscripción null) → NO sin-plan-vencio', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({
          hadPlan: true,
          hasScheduledPlan: true,
          scheduledStartDate: '2026-10-20',
          lastPlan: { planName: 'Pase Libre', endDate: '2026-10-14', status: 'expired' },
        }),
      }),
    )
    expect(m.kind).toBe('presencial-sin-turno')
    sinFechas(m)
  })

  it('programada solo en plan-status + próxima clase → presencial-proxima', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasScheduledPlan: true, scheduledStartDate: '2026-10-20' }),
        nextBooking: NEXT_MONDAY,
      }),
    )
    expect(m.kind).toBe('presencial-proxima')
    sinFechas(m)
  })

  it('primer plan programado (nunca tuvo uno) → card normal, no "Arrancá tu plan"', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasScheduledPlan: true, hadPlan: false }),
      }),
    )
    expect(m.kind).toBe('presencial-sin-turno')
    expect(allCopy(m)).not.toContain('Arrancá')
  })

  it('programada y virtual → online-libre sin "Ver planes"', () => {
    const m = resolveTodayCard(
      baseInput({
        isVirtual: true,
        subscription: null,
        planStatus: planStatus({ hasScheduledPlan: true, scheduledStartDate: '2026-10-20' }),
      }),
    )
    expect(m.kind).toBe('online-libre')
    expect(m.secondary).toBeNull()
    sinFechas(m)
  })

  it('programada y virtual con programa → online-programa', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, subscription: SCHEDULED_SUB, program: PROGRAM }),
    )
    expect(m.kind).toBe('online-programa')
  })

  it('programada con reserva de hoy → presencial-turno', () => {
    const m = resolveTodayCard(baseInput({ subscription: SCHEDULED_SUB, booking: BOOKING }))
    expect(m.kind).toBe('presencial-turno')
  })

  it('subscription null + planStatus null + planLoading → cargando', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: null, planLoading: true }),
    )
    expect(m.kind).toBe('cargando')
  })

  it('programada y cargando → igual no es cargando (ya se sabe que tiene plan)', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasScheduledPlan: true, scheduledStartDate: '2026-10-20' }),
        planLoading: true,
      }),
    )
    expect(m.kind).not.toBe('cargando')
  })

  it('con plan activo Y otra programada (renovación anticipada) → card normal', () => {
    const m = resolveTodayCard(
      baseInput({ planStatus: planStatus({ hasActivePlan: true, hasScheduledPlan: true }) }),
    )
    expect(m.kind).toBe('presencial-sin-turno')
  })

  it('suscripción expirada sin programada → sigue siendo sin-plan-vencio', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: { ...SCHEDULED_SUB, status: 'expired' },
        planStatus: planStatus({ hadPlan: true }),
      }),
    )
    expect(m.kind).toBe('sin-plan-vencio')
  })
})

describe('resolveTodayCard — programas extra', () => {
  it('presencial con hasExtraPrograms → tertiary "Tus programas" (open-program)', () => {
    const m = resolveTodayCard(baseInput({ hasExtraPrograms: true }))
    expect(m.tertiary).toEqual({ label: 'Tus programas', action: 'open-program' })
  })

  it('también en clase de hoy, sin reserva y completada', () => {
    expect(
      resolveTodayCard(baseInput({ hasExtraPrograms: true, booking: BOOKING })).tertiary,
    ).not.toBeNull()
    expect(resolveTodayCard(baseInput({ hasExtraPrograms: true, dow: 7 })).tertiary).not.toBeNull()
    expect(
      resolveTodayCard(baseInput({ hasExtraPrograms: true, todayCompleted: true })).tertiary,
    ).not.toBeNull()
  })

  it('virtual o sin programas extra → sin tertiary', () => {
    expect(resolveTodayCard(baseInput({ hasExtraPrograms: false })).tertiary).toBeNull()
    expect(
      resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM, hasExtraPrograms: true }))
        .tertiary,
    ).toBeNull()
  })

  it('sin plan nunca muestra "Tus programas"', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus(), hasExtraPrograms: true }),
    )
    expect(m.tertiary).toBeNull()
  })
})

describe('helpers de fecha y sede', () => {
  it('formatLongDate arma "30 de septiembre" y tolera timestamps ISO', () => {
    expect(formatLongDate('2026-09-30')).toBe('30 de septiembre')
    expect(formatLongDate('2026-10-20')).toBe('20 de octubre')
    expect(formatLongDate('2026-09-30T00:00:00.000Z')).toBe('30 de septiembre')
  })

  it('fechas inválidas no explotan', () => {
    expect(formatLongDate('basura')).toBe('basura')
  })

  it('formatNextClassTitle arma "Día N · HH:MM" con el día en mayúscula', () => {
    expect(formatNextClassTitle('2026-10-19', '19:00')).toBe('Lunes 19 · 19:00')
    expect(formatNextClassTitle('2026-10-21', '19:00:00')).toBe('Miércoles 21 · 19:00')
    expect(formatNextClassTitle('2026-10-25', '10:00')).toBe('Domingo 25 · 10:00')
    expect(formatNextClassTitle('2026-11-01', '07:30')).toBe('Domingo 1 · 07:30')
  })

  it('formatNextClassTitle tolera timestamps ISO y no depende de la zona del proceso', () => {
    expect(formatNextClassTitle('2026-10-19T00:00:00.000Z', '19:00')).toBe('Lunes 19 · 19:00')
    expect(formatNextClassTitle('2026-12-31', '23:59')).toBe('Jueves 31 · 23:59')
  })

  it('formatNextClassTitle con fecha inválida no explota: solo la hora', () => {
    expect(formatNextClassTitle('basura', '19:00')).toBe('19:00')
    expect(formatNextClassTitle('', '08:15:00')).toBe('08:15')
  })

  it('shortBranchName quita el prefijo "El Templo " (case-insensitive)', () => {
    expect(shortBranchName('El Templo Alem')).toBe('Alem')
    expect(shortBranchName('el templo Moreno')).toBe('Moreno')
    expect(shortBranchName('Alem')).toBe('Alem')
  })
})

describe('resolveTodayCard — matriz anti-regresión (UAT D3 + D11)', () => {
  it('ninguna combinación de entrada produce descanso, "descans", "turno" ni "mañana" en la próxima clase', () => {
    const subs: Pick<TodayCardInput, 'subscription' | 'planStatus'>[] = [
      { subscription: ACTIVE_SUB, planStatus: null },
      {
        subscription: { status: 'scheduled', planName: 'Pase Libre', startDate: '2026-10-20' },
        planStatus: null,
      },
      { subscription: null, planStatus: planStatus({ hadPlan: true }) },
      { subscription: null, planStatus: planStatus() },
    ]
    let evaluated = 0
    for (const isVirtual of [false, true]) {
      for (const program of [null, PROGRAM]) {
        for (const { todayStr, dow } of DAYS) {
          for (const todayRoute of ['Muscle Up', null]) {
            for (const booking of [null, BOOKING]) {
              for (const windowState of [null, 'open', 'after'] as const) {
                for (const nextBooking of [null, NEXT_MONDAY]) {
                  for (const waitlistTime of [null, '19:00']) {
                    for (const sub of subs) {
                      const m = resolveTodayCard(
                        baseInput({
                          isVirtual,
                          program,
                          todayStr,
                          dow,
                          todayRoute,
                          booking,
                          windowState,
                          nextBooking,
                          waitlistTime,
                          ...sub,
                        }),
                      )
                      evaluated += 1
                      const where = JSON.stringify({
                        isVirtual,
                        program: program !== null,
                        todayStr,
                        todayRoute,
                        booking: booking !== null,
                        windowState,
                        nextBooking: nextBooking !== null,
                        waitlistTime,
                        sub: sub.subscription?.status ?? sub.planStatus?.hadPlan,
                      })
                      // Se compara como string: el tipo ya no admite 'descanso' y eso es lo que se prueba.
                      expect(String(m.kind), where).not.toBe('descanso')
                      expect(String(m.kind), where).not.toBe('plan-programado')
                      expect(allCopy(m), where).not.toMatch(/descans/i)
                      expect(allCopy(m), where).not.toMatch(/turno/i)
                      if (m.kind === 'presencial-proxima') {
                        expect(m.title, where).not.toMatch(/mañana/i)
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(evaluated).toBe(2 * 2 * 7 * 2 * 2 * 3 * 2 * 2 * 4)
  })

  it('un presencial con plan (o programado) sin clase vigente hoy nunca ve "Entrenar" ni "Ver la sesión" salvo con clase de hoy', () => {
    for (const { todayStr, dow } of DAYS) {
      for (const todayRoute of ['Muscle Up', null]) {
        const m = resolveTodayCard(baseInput({ todayStr, dow, todayRoute }))
        const copy = allCopy(m)
        expect(copy).not.toContain('Entrenar')
        expect(copy).not.toContain('Ver la sesión')
      }
    }
  })
})
