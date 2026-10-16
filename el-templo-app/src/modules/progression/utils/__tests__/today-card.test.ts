import { describe, it, expect } from 'vitest'
import {
  resolveTodayCard,
  formatDayKicker,
  formatLongDate,
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
    todayRoute: 'Muscle Up',
    tomorrowRoute: null,
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
    checkInMessage: null,
    trialEligible: false,
    weekLoaded: true,
    ...over,
  }
}

const BOOKING = {
  time: '19:00',
  branchName: 'El Templo Alem',
  activityName: 'Calistenia',
  status: 'reservado',
}

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
    expect(m.kicker).toBe('Hoy · jueves 15')
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

describe('resolveTodayCard — presencial con turno', () => {
  it('copy de D-03: kicker, ruta, "Tu turno: 19:00 · Alem", Ver la sesión + Cambiar turno', () => {
    const m = resolveTodayCard(baseInput({ booking: BOOKING }))
    expect(m.kind).toBe('presencial-turno')
    expect(m.kicker).toBe('Hoy · jueves 15')
    expect(m.title).toBe('Muscle Up')
    expect(m.meta).toContainEqual({ text: '19:00', strong: true })
    expect(flat(m.meta)).toBe('Tu turno: 19:00 · Alem')
    expect(m.primary).toEqual({ label: 'Ver la sesión', to: '/training' })
    expect(m.secondary).toEqual({ label: 'Cambiar turno', to: '/reservas' })
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

  it('L35: ventana pasada y sin asistencia → "Tu turno fue", chip "Tu clase ya pasó", sin "Cambiar turno"', () => {
    const m = resolveTodayCard(
      baseInput({ booking: BOOKING, windowState: 'after', minutesToStart: -45 }),
    )
    expect(m.kind).toBe('presencial-turno')
    expect(flat(m.meta)).toBe('Tu turno fue: 19:00 · Alem')
    expect(m.chips.map((c) => c.text)).toEqual(['Tu clase ya pasó'])
    expect(m.secondary).toEqual({ label: 'Mis turnos', to: '/reservas' })
    expect(allCopy(m)).not.toContain('Marcar asistencia')
    expect(allCopy(m)).not.toContain('Tu clase empieza')
  })

  it('L35: ventana pasada pero CON asistencia → solo el chip de asistencia, copy normal', () => {
    const m = resolveTodayCard(
      baseInput({
        booking: BOOKING,
        windowState: 'after',
        minutesToStart: -45,
        attendanceMarkedAt: '19:05',
      }),
    )
    expect(m.chips.map((c) => c.text)).toEqual(['Asistencia registrada 19:05'])
    expect(flat(m.meta)).toBe('Tu turno: 19:00 · Alem')
    expect(m.secondary?.label).toBe('Cambiar turno')
  })

  it('reserva de otra sede → usa el nombre corto de ESA sede', () => {
    const m = resolveTodayCard(
      baseInput({ booking: { ...BOOKING, branchName: 'El Templo Moreno' } }),
    )
    expect(flat(m.meta)).toBe('Tu turno: 19:00 · Moreno')
  })

  it('checkInMessage → chip dentro de la card, después del de ventana', () => {
    const m = resolveTodayCard(
      baseInput({
        booking: BOOKING,
        windowState: 'open',
        minutesToStart: 12,
        checkInMessage: 'Sesión liviana sugerida',
      }),
    )
    expect(m.chips.map((c) => c.text)).toEqual([
      'Tu clase empieza en 12 min',
      'Sesión liviana sugerida',
    ])
  })
})

describe('resolveTodayCard — presencial sin turno', () => {
  it('copy de D-03: ruta, "No tenés turno hoy", Reservá tu turno + Ver la sesión', () => {
    const m = resolveTodayCard(baseInput())
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.title).toBe('Muscle Up')
    expect(flat(m.meta)).toBe('No tenés turno hoy')
    expect(m.primary).toEqual({ label: 'Reservá tu turno', to: '/reservas' })
    expect(m.secondary).toEqual({ label: 'Ver la sesión', to: '/training' })
  })

  it('lista de espera → "Estás en lista de espera · 19:00"', () => {
    const m = resolveTodayCard(baseInput({ waitlistTime: '19:00' }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(flat(m.meta)).toBe('Estás en lista de espera · 19:00')
  })

  it('el checkInMessage aparece como chip', () => {
    const m = resolveTodayCard(baseInput({ checkInMessage: 'Considerá movilidad hoy' }))
    expect(m.chips.map((c) => c.text)).toEqual(['Considerá movilidad hoy'])
  })
})

describe('resolveTodayCard — descanso presencial', () => {
  it('domingo con ruta de mañana y turno mañana → meta completa', () => {
    const m = resolveTodayCard(
      baseInput({
        todayStr: '2026-10-18',
        dow: 7,
        todayRoute: null,
        tomorrowRoute: 'Back Lever',
        nextBooking: { date: '2026-10-19', time: '19:00', branchName: 'El Templo Alem' },
      }),
    )
    expect(m.kind).toBe('descanso')
    expect(m.kicker).toBe('Hoy · domingo 18')
    expect(m.title).toBe('Hoy descansás')
    expect(flat(m.meta)).toBe('Mañana: Back Lever · tu turno 19:00 · Alem')
    expect(m.meta).toContainEqual({ text: 'Back Lever', strong: true })
    expect(m.primary).toEqual({ label: 'Ver la de mañana', to: '/training' })
    expect(m.secondary).toEqual({ label: 'Mis turnos', to: '/reservas' })
  })

  it('el próximo turno NO es mañana → la meta no menciona turno', () => {
    const m = resolveTodayCard(
      baseInput({
        todayStr: '2026-10-18',
        dow: 7,
        todayRoute: null,
        tomorrowRoute: 'Back Lever',
        nextBooking: { date: '2026-10-21', time: '19:00', branchName: 'El Templo Alem' },
      }),
    )
    expect(flat(m.meta)).toBe('Mañana: Back Lever')
  })

  it('sin ruta de mañana → "Reservá tu turno" y sin secundario duplicado', () => {
    const m = resolveTodayCard(
      baseInput({ todayStr: '2026-10-18', dow: 7, todayRoute: null, tomorrowRoute: null }),
    )
    expect(m.kind).toBe('descanso')
    expect(m.meta).toBeNull()
    expect(m.primary).toEqual({ label: 'Reservá tu turno', to: '/reservas' })
    expect(m.secondary).toBeNull()
  })

  it('día hábil sin sesión hoy (semana cargada) y sin reserva → descanso', () => {
    const m = resolveTodayCard(baseInput({ todayRoute: null, tomorrowRoute: 'Planche' }))
    expect(m.kind).toBe('descanso')
  })

  it('día hábil sin sesión pero CON reserva hoy → presencial-turno (precedencia)', () => {
    const m = resolveTodayCard(baseInput({ todayRoute: null, booking: BOOKING }))
    expect(m.kind).toBe('presencial-turno')
  })

  it('domingo con reserva → presencial-turno (la reserva gana al descanso)', () => {
    const m = resolveTodayCard(baseInput({ dow: 7, booking: BOOKING }))
    expect(m.kind).toBe('presencial-turno')
  })

  it('domingo en la zona de la sede aunque el teléfono diga otra cosa: depende solo de dow', () => {
    const m = resolveTodayCard(baseInput({ dow: 7, todayRoute: null }))
    expect(m.kind).toBe('descanso')
  })
})

describe('resolveTodayCard — guarda de semana no cargada', () => {
  it('presencial con plan, sin ruta, sin reserva y semana NO cargada → presencial-sin-turno (no descanso)', () => {
    const m = resolveTodayCard(baseInput({ todayRoute: null, weekLoaded: false }))
    expect(m.kind).toBe('presencial-sin-turno')
    expect(m.title).toBe('Tu sesión de hoy')
  })

  it('virtual con programa, sin ruta y semana NO cargada → online-programa', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, todayRoute: null, weekLoaded: false }),
    )
    expect(m.kind).toBe('online-programa')
  })

  it('domingo con semana NO cargada → sigue siendo descanso', () => {
    const m = resolveTodayCard(baseInput({ dow: 7, todayRoute: null, weekLoaded: false }))
    expect(m.kind).toBe('descanso')
  })

  it('virtual con programa, domingo y semana NO cargada → descanso online', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, dow: 7, todayRoute: null, weekLoaded: false }),
    )
    expect(m.kind).toBe('descanso')
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
        weekLoaded: false,
        program: { ...PROGRAM, durationWeeks: null },
      }),
    )
    expect(m.title).toBe('Calistenia Online')
    expect(flat(m.meta)).toBe('Semana 3 · 1 de 3 sesiones esta semana')
  })

  it('el checkInMessage aparece también en online-programa', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, checkInMessage: 'Escuchá tu cuerpo hoy' }),
    )
    expect(m.chips.map((c) => c.text)).toEqual(['Escuchá tu cuerpo hoy'])
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

describe('resolveTodayCard — descanso online con programa', () => {
  it('domingo con ruta de mañana → Ver la de mañana + Mi programa, sin acciones de turnos', () => {
    const m = resolveTodayCard(
      baseInput({
        isVirtual: true,
        program: PROGRAM,
        dow: 7,
        todayRoute: null,
        tomorrowRoute: 'Back Lever',
        nextBooking: { date: '2026-10-16', time: '19:00', branchName: 'El Templo Alem' },
      }),
    )
    expect(m.kind).toBe('descanso')
    expect(m.primary).toEqual({ label: 'Ver la de mañana', to: '/training' })
    expect(m.secondary).toEqual({ label: 'Mi programa', action: 'open-program' })
    expect(flat(m.meta)).toBe('Mañana: Back Lever')
    const copy = allCopy(m)
    expect(copy).not.toContain('Reservá tu turno')
    expect(copy).not.toContain('Mis turnos')
    expect(copy).not.toContain('tu turno')
  })

  it('día hábil sin sesión hoy (semana cargada) → descanso online', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, todayRoute: null, tomorrowRoute: 'Planche' }),
    )
    expect(m.kind).toBe('descanso')
  })

  it('sin ruta de mañana → primario "Mi programa" (open-program) y sin secundario', () => {
    const m = resolveTodayCard(
      baseInput({ isVirtual: true, program: PROGRAM, dow: 7, todayRoute: null }),
    )
    expect(m.kind).toBe('descanso')
    expect(m.meta).toBeNull()
    expect(m.primary).toEqual({ label: 'Mi programa', action: 'open-program' })
    expect(m.secondary).toBeNull()
  })

  it('el checkInMessage aparece como chip', () => {
    const m = resolveTodayCard(
      baseInput({
        isVirtual: true,
        program: PROGRAM,
        dow: 7,
        todayRoute: null,
        checkInMessage: 'Escuchá tu cuerpo hoy',
      }),
    )
    expect(m.chips.map((c) => c.text)).toEqual(['Escuchá tu cuerpo hoy'])
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

describe('resolveTodayCard — plan programado (L34)', () => {
  it('suscripción scheduled → "Arranca el 20 de octubre", sin "Renová tu plan"', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: { status: 'scheduled', planName: 'Pase Libre', startDate: '2026-10-20' },
        planStatus: planStatus({ hadPlan: true }),
      }),
    )
    expect(m.kind).toBe('plan-programado')
    expect(m.title).toBe('Arranca el 20 de octubre')
    expect(flat(m.meta)).toBe('Pase Libre')
    expect(m.primary).toEqual({ label: 'Ver planes', to: '/planes' })
    expect(allCopy(m)).not.toContain('Renová')
    expect(allCopy(m)).not.toContain('Arrancá tu plan')
  })

  it('plan vencido + programada solo en plan-status (suscripción null) → plan-programado con su fecha', () => {
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
    expect(m.kind).toBe('plan-programado')
    expect(m.title).toBe('Arranca el 20 de octubre')
    expect(allCopy(m)).not.toContain('Renová')
  })

  it('programada sin fecha conocida → título genérico (no inventa fecha)', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasScheduledPlan: true, scheduledStartDate: null }),
      }),
    )
    expect(m.kind).toBe('plan-programado')
    expect(m.title).toBe('Tu plan ya está programado')
  })

  it('programada y cargando → cargando', () => {
    const m = resolveTodayCard(
      baseInput({
        subscription: null,
        planStatus: planStatus({ hasScheduledPlan: true, scheduledStartDate: '2026-10-20' }),
        planLoading: true,
      }),
    )
    expect(m.kind).toBe('cargando')
  })

  it('programada gana sobre sede virtual sin plan (no cae en online-libre)', () => {
    const m = resolveTodayCard(
      baseInput({
        isVirtual: true,
        subscription: null,
        planStatus: planStatus({ hasScheduledPlan: true, scheduledStartDate: '2026-10-20' }),
      }),
    )
    expect(m.kind).toBe('plan-programado')
  })

  it('con plan activo Y otra programada (renovación anticipada) → card normal, no plan-programado', () => {
    const m = resolveTodayCard(
      baseInput({ planStatus: planStatus({ hasActivePlan: true, hasScheduledPlan: true }) }),
    )
    expect(m.kind).toBe('presencial-sin-turno')
  })
})

describe('resolveTodayCard — programas extra', () => {
  it('presencial con hasExtraPrograms → tertiary "Tus programas" (open-program)', () => {
    const m = resolveTodayCard(baseInput({ hasExtraPrograms: true }))
    expect(m.tertiary).toEqual({ label: 'Tus programas', action: 'open-program' })
  })

  it('también en turno, descanso y completada', () => {
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
  it('formatDayKicker es independiente de la zona del proceso', () => {
    expect(formatDayKicker('2026-10-18')).toBe('Hoy · domingo 18')
    expect(formatDayKicker('2026-10-15')).toBe('Hoy · jueves 15')
    expect(formatDayKicker('2026-01-01')).toBe('Hoy · jueves 1')
  })

  it('formatLongDate arma "30 de septiembre" y tolera timestamps ISO', () => {
    expect(formatLongDate('2026-09-30')).toBe('30 de septiembre')
    expect(formatLongDate('2026-10-20')).toBe('20 de octubre')
    expect(formatLongDate('2026-09-30T00:00:00.000Z')).toBe('30 de septiembre')
  })

  it('fechas inválidas no explotan', () => {
    expect(formatDayKicker('basura')).toBe('Hoy')
    expect(formatLongDate('basura')).toBe('basura')
  })

  it('shortBranchName quita el prefijo "El Templo " (case-insensitive)', () => {
    expect(shortBranchName('El Templo Alem')).toBe('Alem')
    expect(shortBranchName('el templo Moreno')).toBe('Moreno')
    expect(shortBranchName('Alem')).toBe('Alem')
  })
})
