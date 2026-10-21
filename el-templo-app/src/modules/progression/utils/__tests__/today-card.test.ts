import { describe, it, expect } from 'vitest'
import {
  resolveTodayCard,
  formatLongDate,
  formatNextClassTitle,
  shortBranchName,
  pickNextRoute,
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
    nextRoute: null,
    nextBooking: null,
    program: null,
    hasExtraPrograms: false,
    trialEligible: false,
    libreEnabled: true,
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
    flat(m.pill?.text ?? null),
    m.primary?.label ?? '',
    m.secondary?.label ?? '',
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
    expect(m.pill).toBeNull()
    expect(m.progress).toBeNull()
    expect(m.primary).toBeNull()
    expect(m.secondary).toBeNull()
    const copy = allCopy(m)
    expect(copy).not.toContain('Arrancá tu plan')
    expect(copy).not.toContain('Renová')
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
    expect(flat(m.meta)).toBe('Tu clase: 19:00 · Sede Alem')
    expect(m.primary).toEqual({ label: 'Ver la sesión', to: '/training' })
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
  })

  it('sin ruta cargada → el título es la actividad de la reserva', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING, todayRoute: null }))
    expect(m.title).toBe('Calistenia')
  })

  it('reserva de otra sede → usa el nombre corto de ESA sede', () => {
    const m = resolveTodayCard(
      baseInput({ booking: { ...BOOKING, branchName: 'El Templo Moreno' } }),
    )
    expect(flat(m.meta)).toBe('Tu clase: 19:00 · Sede Moreno')
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
    expect(m.title).toBe('Reservá\ntu clase')
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

  it('ventana pasada pero CON asistencia → presencial-turno con la pill ok y link a Libre', () => {
    const m = resolveTodayCard(
      baseInput({ ...PASADA, windowState: 'after', attendanceMarkedAt: '19:05' }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(flat(m.pill?.text ?? null)).toBe('Asistencia registrada 19:05 · Sede Alem')
    expect(m.meta).toBeNull()
    expect(m.secondary?.label).toBe('Probá el modo Libre')
  })

  it('ventana abierta sin asistencia → sigue siendo presencial-turno con pill de ventana', () => {
    const m = resolveTodayCard(baseInput({ ...PASADA, windowState: 'open', minutesToStart: 5 }))
    expect(m.kind).toBe('presencial-turno')
    expect(flat(m.pill?.text ?? null)).toBe('Empieza en 5 min · Sede Alem')
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
  it('domingo con clase el lunes → "Tu próxima clase", "Lunes 19 · 19:00", sede, Mis clases + Libre', () => {
    const m = resolveTodayCard(
      baseInput({ todayStr: '2026-10-18', dow: 7, todayRoute: null, nextBooking: NEXT_MONDAY }),
    )
    expect(m.kind).toBe('presencial-proxima')
    expect(m.kicker).toBe('Tu próxima clase')
    expect(m.title).toBe('Lunes 19 · 19:00')
    expect(m.meta).toEqual([{ text: 'Sede Alem' }])
    expect(flat(m.meta)).toBe('Sede Alem')
    expect(m.primary).toEqual({ label: 'Mis clases', to: '/reservas' })
    // Un solo link: con plan, "Probá el modo Libre" reemplaza a "Cambiar clase" ("Mis clases" ya va a /reservas).
    expect(m.secondary).toEqual({ label: 'Probá el modo Libre', to: '/training?tab=libre' })
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
    expect(flat(m.meta)).toBe('Sede Moreno')
  })

  it('sin pill', () => {
    expect(resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY })).pill).toBeNull()
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
  it('copy: "Sin clase reservada", "Reservá tu clase", "Próxima: <plani>" (plani de hoy), Reservar y Libre como único link', () => {
    const m = resolveTodayCard(baseInput({ nextRoute: 'Muscle Up' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.kicker).toBe('Sin clase reservada')
    expect(m.title).toBe('Reservá\ntu clase')
    expect(flat(m.meta)).toBe('Próxima: Muscle Up')
    expect(m.meta?.[1]).toEqual({ text: 'Muscle Up', strong: true })
    expect(m.primary).toEqual({ label: 'Reservar', to: '/reservas' })
    expect(m.secondary).toEqual({ label: 'Probá el modo Libre', to: '/training?tab=libre' })
  })

  it('sin plani hoy pero con un día siguiente: "Próxima: <plani de ese día>"', () => {
    const m = resolveTodayCard(baseInput({ todayRoute: null, nextRoute: 'Press to Handstand' }))
    expect(flat(m.meta)).toBe('Próxima: Press to Handstand')
    expect(m.meta?.[1]).toEqual({ text: 'Press to Handstand', strong: true })
  })

  it('sin ninguna plani (nextRoute null): respaldo "Elegí día, horario y sede"', () => {
    const m = resolveTodayCard(baseInput({ todayRoute: null, nextRoute: null }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.meta).toEqual([{ text: 'Elegí día, horario y sede' }])
  })

  it('el resto de la card no depende de la plani (solo cambia la meta)', () => {
    const conRuta = resolveTodayCard(baseInput({ todayRoute: 'Muscle Up', nextRoute: 'Muscle Up' }))
    const sinRuta = resolveTodayCard(baseInput({ todayRoute: null, nextRoute: null }))
    expect({ ...sinRuta, meta: null }).toEqual({ ...conRuta, meta: null })
  })

  it('domingo: misma card, kicker "Sin clase reservada", sin descanso ni "Ver la sesión"', () => {
    const m = resolveTodayCard(baseInput({ todayStr: '2026-10-18', dow: 7, todayRoute: null }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.kicker).toBe('Sin clase reservada')
    expect(m.title).toBe('Reservá\ntu clase')
    expect(m.secondary?.label).toBe('Probá el modo Libre')
    const copy = allCopy(m)
    expect(copy).not.toContain('Entrenar')
    expect(copy).not.toContain('Ver la sesión')
    expect(copy).not.toContain('Ver la de mañana')
    expect(copy).not.toMatch(/mañana/i)
  })

  it('lista de espera → "Estás en lista de espera · 19:00", título y botón igual', () => {
    const m = resolveTodayCard(baseInput({ waitlistTime: '19:00', nextRoute: 'Muscle Up' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.title).toBe('Reservá\ntu clase')
    expect(flat(m.meta)).toBe('Estás en lista de espera · 19:00')
    expect(m.primary).toEqual({ label: 'Reservar', to: '/reservas' })
    expect(m.secondary).toBeNull()
  })

  it('sin pill', () => {
    expect(resolveTodayCard(baseInput()).pill).toBeNull()
  })

  it('los 7 días de la semana dan la misma card, sin la fecha (ya está en el saludo)', () => {
    const cards = DAYS.map(({ todayStr, dow }) =>
      resolveTodayCard(baseInput({ todayStr, dow, todayRoute: null })),
    )
    expect(new Set(cards.map((m) => m.title))).toEqual(new Set(['Reservá\ntu clase']))
    expect(new Set(cards.map((m) => m.kicker))).toEqual(new Set(['Sin clase reservada']))
  })
})

describe('resolveTodayCard — completada', () => {
  it('pill ok "Completada · 55 min · RPE 7" y primario session-summary', () => {
    const m = resolveTodayCard(
      baseInput({
        todayCompleted: true,
        todaySession: { durationMinutes: 55, rpe: 7 },
      }),
    )
    expect(m.kind).toBe('completada')
    expect(m.kicker).toBe('Hoy ya entrenaste')
    expect(m.pill).toEqual({
      icon: 'check_circle',
      tone: 'ok',
      text: [{ text: 'Completada · 55 min · RPE 7' }],
    })
    expect(m.meta).toBeNull()
    expect(m.primary).toEqual({ label: 'Ver resumen', to: { name: 'session-summary' } })
  })

  it('omite las partes nulas (sin RPE / sin duración / sin nada)', () => {
    const sinRpe = resolveTodayCard(
      baseInput({ todayCompleted: true, todaySession: { durationMinutes: 40, rpe: null } }),
    )
    expect(flat(sinRpe.pill?.text ?? null)).toBe('Completada · 40 min')
    const sinMin = resolveTodayCard(
      baseInput({ todayCompleted: true, todaySession: { durationMinutes: null, rpe: 6 } }),
    )
    expect(flat(sinMin.pill?.text ?? null)).toBe('Completada · RPE 6')
    const nada = resolveTodayCard(baseInput({ todayCompleted: true, todaySession: null }))
    expect(flat(nada.pill?.text ?? null)).toBe('Completada')
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

  it('online-programa sin pill', () => {
    expect(resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM })).pill).toBeNull()
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
  it('virtual con programa en domingo → online-programa, Entrenar + Mi programa', () => {
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
  it('nunca tuvo plan: copy exacto, sin gancho aunque haya plani hoy', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus({ hadPlan: false }) }),
    )
    expect(m.kind).toBe('sin-plan-nunca')
    expect(m.kicker).toBe('Empezá hoy')
    expect(m.title).toBe('Arrancá tu plan')
    expect(flat(m.meta)).toBe('Elegí cómo querés entrenar: en tu sede o online.')
    expect(m.primary).toEqual({ label: 'Ver planes', to: '/planes' })
    expect(allCopy(m)).not.toContain('se entrena')
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

  it('venció: kicker con nombre, "Renová\\ntu plan", meta con la fecha larga y sin gancho', () => {
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
    expect(m.title).toBe('Renová\ntu plan')
    expect(flat(m.meta)).toBe('Tu Pase Libre venció el 30 de septiembre.')
    expect(m.primary).toEqual({ label: 'Renovar', to: '/planes' })
    expect(m.secondary).toEqual({ label: 'Ver otros planes', to: '/planes' })
    expect(allCopy(m)).not.toContain('se entrena')
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
    expect(m.title).toBe('Reservá\ntu clase')
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
  const TUS_PROGRAMAS = { label: 'Tus programas', action: 'open-program' }

  it('"Tus programas" ocupa el único link solo si el gate no tiene otro (lista de espera)', () => {
    const m = resolveTodayCard(baseInput({ hasExtraPrograms: true, waitlistTime: '19:00' }))
    expect(m.secondary).toEqual(TUS_PROGRAMAS)
  })

  it('con Libre o con el secondary propio del gate, esos ganan', () => {
    // Sin reserva (y sin lista de espera), completada y próxima clase: Libre.
    expect(resolveTodayCard(baseInput({ hasExtraPrograms: true })).secondary?.label).toBe(
      'Probá el modo Libre',
    )
    expect(
      resolveTodayCard(baseInput({ hasExtraPrograms: true, todayCompleted: true })).secondary
        ?.label,
    ).toBe('Probá el modo Libre')
    // Clase de hoy sin asistencia: el "Cambiar clase" del gate.
    expect(
      resolveTodayCard(baseInput({ hasExtraPrograms: true, booking: BOOKING })).secondary?.label,
    ).toBe('Cambiar clase')
  })

  it('virtual o sin programas extra → nunca "Tus programas"', () => {
    expect(
      resolveTodayCard(baseInput({ hasExtraPrograms: false, waitlistTime: '19:00' })).secondary,
    ).toBeNull()
    expect(
      resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM, hasExtraPrograms: true }))
        .secondary,
    ).not.toEqual(TUS_PROGRAMAS)
    expect(
      resolveTodayCard(baseInput({ isVirtual: true, program: null, hasExtraPrograms: true }))
        .secondary,
    ).not.toEqual(TUS_PROGRAMAS)
  })

  it('sin plan nunca muestra "Tus programas"', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus(), hasExtraPrograms: true }),
    )
    expect(m.secondary).toBeNull()
  })

  it('cargando nunca muestra "Tus programas"', () => {
    const m = resolveTodayCard(baseInput({ bookingsLoading: true, hasExtraPrograms: true }))
    expect(m.kind).toBe('cargando')
    expect(m.secondary).toBeNull()
  })
})

describe('pickNextRoute', () => {
  const week = (entries: [string, string | null][]) => new Map(entries)

  it('la plani de hoy gana sobre las de días siguientes', () => {
    const routes = week([
      ['2026-10-15', 'Muscle Up'],
      ['2026-10-16', 'Press to Handstand'],
    ])
    expect(pickNextRoute('2026-10-15', routes)).toBe('Muscle Up')
  })

  it('sin plani hoy toma el próximo día (> hoy, en orden) con plani, salteando los vacíos', () => {
    const routes = week([
      ['2026-10-17', 'Piernas'],
      ['2026-10-16', null],
      ['2026-10-15', null],
      ['2026-10-18', 'Domingo'],
    ])
    expect(pickNextRoute('2026-10-15', routes)).toBe('Piernas')
  })

  it('ignora días anteriores a hoy', () => {
    const routes = week([
      ['2026-10-13', 'Martes'],
      ['2026-10-14', 'Miércoles'],
      ['2026-10-15', null],
    ])
    expect(pickNextRoute('2026-10-15', routes)).toBeNull()
  })

  it('sin ninguna plani (o mapa vacío) → null', () => {
    expect(pickNextRoute('2026-10-15', week([]))).toBeNull()
    expect(pickNextRoute('2026-10-15', week([['2026-10-16', null]]))).toBeNull()
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
                      expect(m.pill === null || m.meta === null, where).toBe(true)
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

describe('resolveTodayCard — link a Libre en el único link (fase 197 D-17)', () => {
  const LIBRE = { label: 'Probá el modo Libre', to: '/training?tab=libre' }

  it('sesión de hoy completada → link a Libre', () => {
    const m = resolveTodayCard(baseInput({ todayCompleted: true }))
    expect(m.kind).toBe('completada')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('antes de la clase (ventana before, sin asistencia) → sin link', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'before', minutesToStart: 90 }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('durante la clase (ventana open, sin asistencia) → sin link', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: 12 }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('clase de hoy con asistencia registrada → link a Libre', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'open', attendanceMarkedAt: '18:55' }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('presencial sin reserva y sin lista de espera → link a Libre', () => {
    const m = resolveTodayCard(baseInput())
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('presencial en lista de espera → sin link', () => {
    const m = resolveTodayCard(baseInput({ waitlistTime: '19:00' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('próxima clase reservada otro día (hoy no hay clase) → link a Libre', () => {
    const m = resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY }))
    expect(m.kind).toBe('presencial-proxima')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('clase de hoy perdida (ventana after, sin asistencia, sin próxima) → link a Libre', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING, windowState: 'after' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('reservas de hoy todavía cargando → sin link', () => {
    const m = resolveTodayCard(baseInput({ bookingsLoading: true }))
    expect(m.kind).toBe('cargando')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('online con programa y plani hoy → sin link', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, todayRoute: 'Muscle Up' }),
    )
    expect(m.kind).toBe('online-programa')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('online con programa y sin plani hoy → sin link a Libre (queda "Mi programa")', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM, todayRoute: null }))
    expect(m.kind).toBe('online-programa')
    expect(m.secondary).toEqual({ label: 'Mi programa', action: 'open-program' })
  })

  it('online libre con plan y sin plani hoy → link a Libre', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, todayRoute: null }))
    expect(m.kind).toBe('online-libre')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('online libre con plan y plani hoy → sin link', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, todayRoute: 'Muscle Up' }))
    expect(m.kind).toBe('online-libre')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('online completada → link a Libre', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, todayCompleted: true }))
    expect(m.kind).toBe('completada')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('sin plan nunca → sin link', () => {
    const m = resolveTodayCard(baseInput({ subscription: null, planStatus: null }))
    expect(m.kind).toBe('sin-plan-nunca')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('sin plan vencido → sin link', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus({ hadPlan: true }) }),
    )
    expect(m.kind).toBe('sin-plan-vencio')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('sin plan online (vidriera "Ver planes") → sin link', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, subscription: null, todayRoute: null }))
    expect(m.kind).toBe('online-libre')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('cargando el plan → sin link', () => {
    const m = resolveTodayCard(baseInput({ subscription: null, planLoading: true }))
    expect(m.kind).toBe('cargando')
    expect(m.secondary).not.toEqual(LIBRE)
  })

  it('solo plan programado (sin plan activo) → sin link, ni siquiera completada', () => {
    const scheduled = { ...ACTIVE_SUB, status: 'scheduled' }
    expect(resolveTodayCard(baseInput({ subscription: scheduled })).secondary).not.toEqual(LIBRE)
    expect(
      resolveTodayCard(baseInput({ subscription: scheduled, todayCompleted: true })).secondary,
    ).not.toEqual(LIBRE)
  })

  it('plan pausado cuenta como plan: sin reserva hoy → link', () => {
    const m = resolveTodayCard(baseInput({ subscription: { ...ACTIVE_SUB, status: 'paused' } }))
    expect(m.secondary).toEqual(LIBRE)
  })

  it('el link reemplaza al secondary del gate y no altera ningún otro campo', () => {
    const m = resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY }))
    expect(m.kind).toBe('presencial-proxima')
    expect(m.secondary).toEqual(LIBRE)
    expect(m.primary).toEqual({ label: 'Mis clases', to: '/reservas' })
    expect(m.kicker).toBe('Tu próxima clase')
    expect(m.title).toBe('Lunes 19 · 19:00')
    expect(flat(m.meta)).toBe('Sede Alem')
    expect(m.pill).toBeNull()
    expect(allCopy(m)).not.toContain('Cambiar clase')
  })

  it('online-programa sin plani hoy: "Mi programa" gana, nunca Libre', () => {
    const m = resolveTodayCard(baseInput({ isVirtual: true, program: PROGRAM, todayRoute: null }))
    expect(m.secondary).toEqual({ label: 'Mi programa', action: 'open-program' })
    expect(allCopy(m)).not.toContain('Probá el modo Libre')
  })
})

describe('resolveTodayCard — alto fijo: pill, un solo link y sin hook (fase 197, sketch 017)', () => {
  const LIBRE = { label: 'Probá el modo Libre', to: '/training?tab=libre' }
  const TUS_PROGRAMAS = { label: 'Tus programas', action: 'open-program' }

  it('asistencia registrada → pill ok con la hora en strong y la sede; meta null; link a Libre', () => {
    const m = resolveTodayCard(
      baseInput({
        booking: BOOKING,
        windowState: 'open',
        minutesToStart: 8,
        attendanceMarkedAt: '18:55',
      }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(m.pill).toEqual({
      icon: 'check_circle',
      tone: 'ok',
      text: [
        { text: 'Asistencia registrada ' },
        { text: '18:55', strong: true },
        { text: ' · Sede Alem' },
      ],
    })
    expect(m.meta).toBeNull()
    expect(m.secondary).toEqual(LIBRE)
    expect(allCopy(m)).not.toContain('Cambiar clase')
  })

  it('asistencia en una reserva de otra sede → la sede de ESA reserva', () => {
    const m = resolveTodayCard(
      baseInput({
        booking: { ...BOOKING, branchName: 'El Templo Moreno' },
        attendanceMarkedAt: '18:55',
      }),
    )
    expect(flat(m.pill?.text ?? null)).toBe('Asistencia registrada 18:55 · Sede Moreno')
  })

  it('ventana abierta con 12 min → pill neutral "Empieza en 12 min · Sede Alem"; meta null; "Cambiar clase"', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: 12 }),
    )
    expect(m.pill).toEqual({
      icon: 'schedule',
      tone: 'neutral',
      text: [{ text: 'Empieza en ' }, { text: '12 min', strong: true }, { text: ' · Sede Alem' }],
    })
    expect(flat(m.pill?.text ?? null)).toBe('Empieza en 12 min · Sede Alem')
    expect(m.meta).toBeNull()
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
  })

  it.each([0, -3, null])(
    'ventana abierta con minutesToStart %s → pill neutral "Tu clase ya empezó · Sede Alem"',
    (minutesToStart) => {
      const m = resolveTodayCard(
        baseInput({ booking: BOOKING, windowState: 'open', minutesToStart }),
      )
      expect(m.pill).toEqual({
        icon: 'schedule',
        tone: 'neutral',
        text: [{ text: 'Tu clase ya empezó · Sede Alem' }],
      })
      expect(m.meta).toBeNull()
      expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
    },
  )

  it('antes de la clase → sin pill, meta "Tu clase: 19:00 · Sede Alem" y "Cambiar clase"', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'before', minutesToStart: 90 }),
    )
    expect(m.pill).toBeNull()
    expect(flat(m.meta)).toBe('Tu clase: 19:00 · Sede Alem')
    expect(m.meta).toContainEqual({ text: '19:00', strong: true })
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
  })

  it('completada con plan → pill ok con el resumen, meta null y link a Libre', () => {
    const m = resolveTodayCard(
      baseInput({ todayCompleted: true, todaySession: { durationMinutes: 55, rpe: 7 } }),
    )
    expect(m.kind).toBe('completada')
    expect(m.pill).toEqual({
      icon: 'check_circle',
      tone: 'ok',
      text: [{ text: 'Completada · 55 min · RPE 7' }],
    })
    expect(m.meta).toBeNull()
    expect(m.secondary).toEqual(LIBRE)
  })

  it('completada con hasExtraPrograms → sigue siendo Libre (prioridad sobre "Tus programas")', () => {
    const m = resolveTodayCard(baseInput({ todayCompleted: true, hasExtraPrograms: true }))
    expect(m.kind).toBe('completada')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('presencial-turno sin asistencia + hasExtraPrograms → "Cambiar clase" (no "Tus programas")', () => {
    for (const windowState of ['before', 'open'] as const) {
      const m = resolveTodayCard(
        baseInput({ booking: BOOKING, windowState, minutesToStart: 12, hasExtraPrograms: true }),
      )
      expect(m.kind).toBe('presencial-turno')
      expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
    }
  })

  it('presencial-turno con asistencia + hasExtraPrograms → Libre (prioridad)', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, attendanceMarkedAt: '18:55', hasExtraPrograms: true }),
    )
    expect(m.secondary).toEqual(LIBRE)
  })

  it('presencial-sin-turno con lista de espera + hasExtraPrograms → "Tus programas" (sin Libre)', () => {
    const m = resolveTodayCard(baseInput({ waitlistTime: '19:00', hasExtraPrograms: true }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.secondary).toEqual(TUS_PROGRAMAS)
  })

  it('presencial-sin-turno sin lista de espera + hasExtraPrograms → Libre', () => {
    const m = resolveTodayCard(baseInput({ hasExtraPrograms: true }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.secondary).toEqual(LIBRE)
  })

  it('presencial-proxima con plan → Libre (reemplaza a "Cambiar clase"); con extra también Libre', () => {
    const sin = resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY }))
    expect(sin.kind).toBe('presencial-proxima')
    expect(sin.secondary).toEqual(LIBRE)
    const con = resolveTodayCard(baseInput({ nextBooking: NEXT_MONDAY, hasExtraPrograms: true }))
    expect(con.secondary).toEqual(LIBRE)
  })

  it('presencial-proxima con plan solo programado + extras → "Cambiar clase" (sin Libre)', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: { ...ACTIVE_SUB, status: 'scheduled' },
        nextBooking: NEXT_MONDAY,
        hasExtraPrograms: true,
      }),
    )
    expect(m.kind).toBe('presencial-proxima')
    // Sin Libre (el plan solo programado no cuenta) gana el link propio del gate, no "Tus programas".
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
  })

  it('sin-plan-vencio → título "Renová\\ntu plan" y el modelo no tiene hook', () => {
    const m = resolveTodayCard(
      baseInput({ subscription: null, planStatus: planStatus({ hadPlan: true }) }),
    )
    expect(m.kind).toBe('sin-plan-vencio')
    expect(m.title).toBe('Renová\ntu plan')
    expect('hook' in m).toBe(false)
  })

  it('sin-plan-nunca no tiene hook aunque haya plani hoy', () => {
    const m = resolveTodayCard(baseInput({ subscription: null, planStatus: planStatus() }))
    expect(m.kind).toBe('sin-plan-nunca')
    expect('hook' in m).toBe(false)
    expect(allCopy(m)).not.toContain('se entrena')
  })

  it('el modelo ya no expone chips, tertiary ni libreLink', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING, hasExtraPrograms: true }))
    expect(Object.keys(m).sort()).toEqual(
      ['kind', 'kicker', 'title', 'meta', 'pill', 'progress', 'primary', 'secondary'].sort(),
    )
  })

  it('invariante: pill y meta nunca conviven (todos los kinds, con y sin extras)', () => {
    const inputs: TodayCardInput[] = [
      baseInput({ subscription: null, planStatus: null, planLoading: true }),
      baseInput({ bookingsLoading: true }),
      baseInput({ booking: BOOKING }),
      baseInput({ booking: BOOKING, windowState: 'before', minutesToStart: 90 }),
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: 12 }),
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: 0 }),
      baseInput({ booking: BOOKING, windowState: 'open', minutesToStart: null }),
      baseInput({ booking: BOOKING, attendanceMarkedAt: '18:55' }),
      baseInput({ booking: BOOKING, windowState: 'after', attendanceMarkedAt: '19:05' }),
      baseInput({ booking: BOOKING, windowState: 'after' }),
      baseInput({ nextBooking: NEXT_MONDAY }),
      baseInput({ waitlistTime: '19:00' }),
      baseInput({ nextRoute: 'Muscle Up' }),
      baseInput({ todayCompleted: true, todaySession: { durationMinutes: 55, rpe: 7 } }),
      baseInput({ todayCompleted: true, todaySession: null }),
      baseInput({ isVirtual: true, program: PROGRAM }),
      baseInput({ isVirtual: true, program: null }),
      baseInput({ isVirtual: true, subscription: null, planStatus: planStatus() }),
      baseInput({ subscription: null, planStatus: planStatus() }),
      baseInput({ subscription: null, planStatus: planStatus({ hadPlan: true }) }),
    ]
    const kinds = new Set<string>()
    for (const input of inputs) {
      for (const hasExtraPrograms of [false, true]) {
        const m = resolveTodayCard({ ...input, hasExtraPrograms })
        kinds.add(m.kind)
        const where = JSON.stringify({ kind: m.kind, hasExtraPrograms })
        expect(m.pill === null || m.meta === null, where).toBe(true)
      }
    }
    expect([...kinds].sort()).toEqual(
      [
        'cargando',
        'presencial-turno',
        'presencial-sin-turno',
        'presencial-proxima',
        'completada',
        'online-programa',
        'online-libre',
        'sin-plan-nunca',
        'sin-plan-vencio',
      ].sort(),
    )
  })
})

describe('resolveTodayCard — Libre apagado (FREE_BLOCKS_ENABLED en false)', () => {
  const off = (over: Partial<TodayCardInput> = {}): TodayCardInput =>
    baseInput({ libreEnabled: false, ...over })

  it('completada → sin link (ningún otro lo ocupa)', () => {
    const m = resolveTodayCard(off({ todayCompleted: true }))
    expect(m.kind).toBe('completada')
    expect(m.secondary).toBeNull()
  })

  it('completada con otros programas → "Tus programas" toma el link', () => {
    const m = resolveTodayCard(off({ todayCompleted: true, hasExtraPrograms: true }))
    expect(m.secondary).toEqual({ label: 'Tus programas', action: 'open-program' })
  })

  it('clase de hoy con asistencia registrada → conserva "Cambiar clase"', () => {
    const m = resolveTodayCard(
      off({ booking: BOOKING, windowState: 'open', attendanceMarkedAt: '18:55' }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
  })

  it('presencial sin reserva → sin link', () => {
    const m = resolveTodayCard(off())
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.secondary).toBeNull()
  })

  it('próxima clase reservada otro día → conserva "Cambiar clase"', () => {
    const m = resolveTodayCard(off({ nextBooking: NEXT_MONDAY }))
    expect(m.kind).toBe('presencial-proxima')
    expect(m.secondary).toEqual({ label: 'Cambiar clase', to: '/reservas' })
  })

  it('clase de hoy perdida → sin link', () => {
    const m = resolveTodayCard(off({ booking: BOOKING, windowState: 'after' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.secondary).toBeNull()
  })

  it('online sin programa y sin plani hoy → sin link', () => {
    const m = resolveTodayCard(off({ isVirtual: true, todayRoute: null }))
    expect(m.kind).toBe('online-libre')
    expect(m.secondary).toBeNull()
  })

  it('ningún día de la semana ni estado menciona el modo Libre', () => {
    const variants: Partial<TodayCardInput>[] = [
      {},
      { todayCompleted: true },
      { booking: BOOKING, windowState: 'open', attendanceMarkedAt: '18:55' },
      { booking: BOOKING, windowState: 'after' },
      { nextBooking: NEXT_MONDAY },
      { isVirtual: true, todayRoute: null },
    ]
    for (const day of DAYS) {
      for (const v of variants) {
        const m = resolveTodayCard(off({ ...day, ...v }))
        expect(allCopy(m)).not.toContain('Libre')
        expect(m.secondary?.to).not.toBe('/training?tab=libre')
      }
    }
  })
})
