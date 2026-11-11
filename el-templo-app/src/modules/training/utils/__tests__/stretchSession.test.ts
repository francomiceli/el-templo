import { describe, it, expect } from 'vitest'
import type { StretchExercise, StretchTodayResponse } from '../../types/stretch'
import { buildStretchSession, stretchPhaseAt, stretchTimeline } from '../stretchSession'

/**
 * Fase 213-09: Session sintética del estiramiento y reloj puro de la rutina
 * (45 s por lado + 10 s de transición antes de cada ejercicio).
 */

function ex(
  exerciseId: number,
  name: string,
  sides: number,
  overrides: Partial<StretchExercise> = {},
): StretchExercise {
  return {
    exerciseId,
    name,
    family: 'LS',
    sides,
    secondsPerSide: 45,
    transitionSeconds: 10,
    videoUrl: `https://cdn.test/${exerciseId}.mp4`,
    ...overrides,
  }
}

const EJERCICIOS: StretchExercise[] = [ex(11, 'Isquios', 2), ex(12, 'Cuello', 1), ex(13, 'Cuádriceps', 2)]

function today(exercises: StretchExercise[] = EJERCICIOS): StretchTodayResponse {
  return {
    status: 'available',
    localDate: '2026-11-11',
    offerId: 9,
    minutes: 7,
    plannedSeconds: 410,
    exercises,
    completedAt: null,
    auraAwarded: false,
  }
}

describe('buildStretchSession', () => {
  it('arma una Session de un bloque STRETCHING con id derivado de la fecha local', () => {
    const s = buildStretchSession(today())
    expect(s.dayId).toBe('ST-2026-11-11')
    expect(s.blockCount).toBe(1)
    expect(s.sessionMode).toBe('regular')
    expect(s.blocks).toHaveLength(1)
    const b = s.blocks[0]!
    expect(b.blockId).toBe('ST-2026-11-11')
    expect(b.role).toBe('STRETCHING')
    expect(b.route).toBe('STRETCHING')
    expect(b.format).toBe('stretch')
    expect(b.formatParams).toBeNull()
    expect(b.timerSpec).toBeNull()
    expect(b.mobilityExercise).toBeNull()
    expect(b.sortOrder).toBe(0)
  })

  it('una Prescription por ejercicio, en el orden del servidor y con los datos del servidor', () => {
    const b = buildStretchSession(today()).blocks[0]!
    expect(b.exercises.map((p) => p.exerciseId)).toEqual([11, 12, 13])
    expect(b.exercises.map((p) => p.exerciseName)).toEqual(['Isquios', 'Cuello', 'Cuádriceps'])
    expect(b.exercises.map((p) => p.sortOrder)).toEqual([0, 1, 2])
    for (const p of b.exercises) {
      expect(p.seconds).toBe(45)
      expect(p.reps).toBeNull()
      expect(p.rest).toBe(10)
      expect(p.contraction).toBe('ISO')
    }
  })

  it('la nota "45 s por lado" solo aparece en los ejercicios de 2 lados', () => {
    const b = buildStretchSession(today()).blocks[0]!
    expect(b.exercises.map((p) => p.notes)).toEqual(['45 s por lado', null, '45 s por lado'])
  })

  it('copia videoUrl tal cual, incluido null', () => {
    const b = buildStretchSession(
      today([ex(1, 'A', 1, { videoUrl: null }), ex(2, 'B', 1, { videoUrl: 'https://v/2' })]),
    ).blocks[0]!
    expect(b.exercises.map((p) => p.videoUrl)).toEqual([null, 'https://v/2'])
  })

  it('usa secondsPerSide y transitionSeconds del servidor, no constantes', () => {
    const b = buildStretchSession(
      today([ex(1, 'A', 2, { secondsPerSide: 30, transitionSeconds: 5 })]),
    ).blocks[0]!
    expect(b.exercises[0]!.seconds).toBe(30)
    expect(b.exercises[0]!.rest).toBe(5)
    expect(b.exercises[0]!.notes).toBe('30 s por lado')
  })

  it('sin ejercicios devuelve un bloque vacío sin romper', () => {
    const b = buildStretchSession(today([])).blocks[0]!
    expect(b.exercises).toEqual([])
  })
})

describe('stretchTimeline', () => {
  it('por ejercicio: transición, lado 1 y lado 2 (solo si tiene 2 lados), en orden', () => {
    const t = stretchTimeline(EJERCICIOS)
    expect(t.map((s) => [s.exerciseIndex, s.kind, s.side])).toEqual([
      [0, 'transition', null],
      [0, 'work', 1],
      [0, 'work', 2],
      [1, 'transition', null],
      [1, 'work', 1],
      [2, 'transition', null],
      [2, 'work', 1],
      [2, 'work', 2],
    ])
  })

  it('los segmentos son contiguos y suman lo mismo que plannedSeconds (410 s)', () => {
    const t = stretchTimeline(EJERCICIOS)
    expect(t[0]!.startMs).toBe(0)
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.startMs).toBe(t[i - 1]!.startMs + t[i - 1]!.durationMs)
    }
    const total = t.reduce((acc, s) => acc + s.durationMs, 0)
    // (2 + 1 + 2) lados * 45 s + 3 transiciones * 10 s = 255 s
    expect(total).toBe(255_000)
  })

  it('una rutina de 5 ejercicios (3 de 2 lados, 2 de 1) dura 410 s = Σ lados * 45 + 10 * n', () => {
    // 8 lados * 45 s + 5 transiciones * 10 s = 410 s (la rutina de W37-lunes-kairos).
    const rutina = [
      ex(1, 'a', 2),
      ex(2, 'b', 2),
      ex(3, 'c', 2),
      ex(4, 'd', 1),
      ex(5, 'e', 1),
    ]
    const total = stretchTimeline(rutina).reduce((acc, s) => acc + s.durationMs, 0)
    expect(total).toBe(410_000)
  })

  it('sin ejercicios no hay segmentos', () => {
    expect(stretchTimeline([])).toEqual([])
  })

  it('una transición de 0 s no genera segmento', () => {
    const t = stretchTimeline([ex(1, 'a', 1, { transitionSeconds: 0 })])
    expect(t.map((s) => s.kind)).toEqual(['work'])
  })
})

describe('stretchPhaseAt', () => {
  const timeline = stretchTimeline(EJERCICIOS)

  it('a 0 ms: transición del ejercicio 0 con 10 s restantes', () => {
    expect(stretchPhaseAt(0, timeline)).toEqual({
      exerciseIndex: 0,
      side: null,
      totalSides: 2,
      phase: 'transition',
      remainingMs: 10_000,
      segmentMs: 10_000,
    })
  })

  it('a 10 000 ms: lado 1 del ejercicio 0 con 45 000 restantes', () => {
    expect(stretchPhaseAt(10_000, timeline)).toEqual({
      exerciseIndex: 0,
      side: 1,
      totalSides: 2,
      phase: 'work',
      remainingMs: 45_000,
      segmentMs: 45_000,
    })
  })

  it('a 55 000 ms: lado 2 del ejercicio 0', () => {
    const p = stretchPhaseAt(55_000, timeline)
    expect(p.exerciseIndex).toBe(0)
    expect(p.side).toBe(2)
    expect(p.phase).toBe('work')
    expect(p.remainingMs).toBe(45_000)
  })

  it('un ejercicio de un solo lado reporta totalSides 1 y side 1', () => {
    // El ejercicio 1 arranca en 10 + 45 + 45 = 100 s: transición hasta 110 s.
    const trans = stretchPhaseAt(100_000, timeline)
    expect(trans).toMatchObject({ exerciseIndex: 1, side: null, totalSides: 1, phase: 'transition' })
    const work = stretchPhaseAt(110_000, timeline)
    expect(work).toMatchObject({ exerciseIndex: 1, side: 1, totalSides: 1, phase: 'work' })
  })

  it('descuenta lo transcurrido dentro del segmento', () => {
    const p = stretchPhaseAt(25_000, timeline)
    expect(p.exerciseIndex).toBe(0)
    expect(p.side).toBe(1)
    expect(p.remainingMs).toBe(30_000)
  })

  it('el límite entre segmentos pertenece al segmento siguiente', () => {
    expect(stretchPhaseAt(9_999, timeline).phase).toBe('transition')
    expect(stretchPhaseAt(10_000, timeline).phase).toBe('work')
  })

  it('al llegar al total (y más allá) es done, sobre el último ejercicio', () => {
    const done = { exerciseIndex: 2, side: null, totalSides: 2, phase: 'done', remainingMs: 0, segmentMs: 0 }
    expect(stretchPhaseAt(255_000, timeline)).toEqual(done)
    expect(stretchPhaseAt(999_999_999, timeline)).toEqual(done)
  })

  it('tiempos negativos o no finitos se tratan como 0', () => {
    expect(stretchPhaseAt(-5_000, timeline)).toEqual(stretchPhaseAt(0, timeline))
    expect(stretchPhaseAt(Number.NaN, timeline)).toEqual(stretchPhaseAt(0, timeline))
  })

  it('con timeline vacío siempre es done', () => {
    expect(stretchPhaseAt(0, [])).toEqual({
      exerciseIndex: 0,
      side: null,
      totalSides: 0,
      phase: 'done',
      remainingMs: 0,
      segmentMs: 0,
    })
  })
})
