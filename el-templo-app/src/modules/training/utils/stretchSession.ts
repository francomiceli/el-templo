/**
 * Session sintética y reloj puro del estiramiento post-clase (fase 213, plan 09).
 *
 * T-213-27: la app NO selecciona ejercicios. Todo sale de lo que devuelve
 * `GET /sessions/stretch/today`; acá solo se lo reformatea para que el player lo
 * trate como un bloque más. Funciones puras: sin stores, sin Vue y sin reloj
 * (el tiempo transcurrido lo pasa quien llama).
 *
 * La rutina es, por ejercicio: transición -> lado 1 -> lado 2 (solo si tiene 2
 * lados). Los segundos salen de cada ejercicio (el servidor hoy manda 45 s por
 * lado y 10 s de transición; ver SPEC §4.1 paso 6), así el total coincide con
 * `plannedSeconds`.
 */
import type { Session } from '../types/session'
import type { StretchExercise, StretchTodayResponse } from '../types/stretch'

const MS = 1000

/** Un tramo del reloj de la rutina. */
export interface StretchSegment {
  exerciseIndex: number
  kind: 'transition' | 'work'
  /** Lado que se estira en un tramo `work`; null en la transición */
  side: 1 | 2 | null
  startMs: number
  durationMs: number
}

export interface StretchPhase {
  exerciseIndex: number
  side: 1 | 2 | null
  /** Lados que tiene el ejercicio actual (1 o 2); 0 si no hay rutina */
  totalSides: number
  phase: 'transition' | 'work' | 'done'
  remainingMs: number
  segmentMs: number
}

/** Session de un solo bloque `STRETCHING` armada desde la respuesta del servidor. */
export function buildStretchSession(today: StretchTodayResponse): Session {
  const id = 'ST-' + today.localDate
  return {
    dayId: id,
    week: 0,
    day: '',
    levelGroup: '',
    blockCount: 1,
    blocks: [
      {
        blockId: id,
        role: 'STRETCHING',
        route: 'STRETCHING',
        pattern: '',
        intensity: 0,
        repsBudget: 0,
        format: 'stretch',
        formatParams: null,
        // El reloj lo resuelve `stretchTimeline`, no el `timerSpec` genérico del API.
        timerSpec: null,
        formatDescription: null,
        sortOrder: 0,
        exercises: today.exercises.map((e, index) => ({
          exerciseId: e.exerciseId,
          exerciseName: e.name,
          contraction: 'ISO',
          reps: null,
          repsMax: null,
          seconds: e.secondsPerSide,
          secondsMax: null,
          increment: null,
          rest: e.transitionSeconds,
          notes: e.sides === 2 ? `${e.secondsPerSide} s por lado` : null,
          sortOrder: index,
          videoUrl: e.videoUrl,
        })),
        mobilityExercise: null,
      },
    ],
    sessionMode: 'regular',
  }
}

/** Tramos de la rutina en orden; los de duración 0 se omiten. */
export function stretchTimeline(exercises: StretchExercise[]): StretchSegment[] {
  const segments: StretchSegment[] = []
  let cursor = 0
  const push = (
    exerciseIndex: number,
    kind: StretchSegment['kind'],
    side: StretchSegment['side'],
    seconds: number,
  ): void => {
    const durationMs = Math.max(0, seconds) * MS
    if (durationMs <= 0) return
    segments.push({ exerciseIndex, kind, side, startMs: cursor, durationMs })
    cursor += durationMs
  }

  exercises.forEach((e, index) => {
    push(index, 'transition', null, e.transitionSeconds)
    push(index, 'work', 1, e.secondsPerSide)
    if (e.sides === 2) push(index, 'work', 2, e.secondsPerSide)
  })
  return segments
}

function sidesOf(timeline: StretchSegment[], exerciseIndex: number): number {
  return timeline.some((s) => s.exerciseIndex === exerciseIndex && s.side === 2) ? 2 : 1
}

/** Dónde está el alumno para un tiempo transcurrido: ejercicio, lado y cuánto falta del tramo. */
export function stretchPhaseAt(elapsedMs: number, timeline: StretchSegment[]): StretchPhase {
  const last = timeline[timeline.length - 1]
  if (!last) {
    return {
      exerciseIndex: 0,
      side: null,
      totalSides: 0,
      phase: 'done',
      remainingMs: 0,
      segmentMs: 0,
    }
  }

  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const totalMs = last.startMs + last.durationMs
  if (elapsed >= totalMs) {
    return {
      exerciseIndex: last.exerciseIndex,
      side: null,
      totalSides: sidesOf(timeline, last.exerciseIndex),
      phase: 'done',
      remainingMs: 0,
      segmentMs: 0,
    }
  }

  const seg = timeline.find((s) => elapsed < s.startMs + s.durationMs) ?? last
  return {
    exerciseIndex: seg.exerciseIndex,
    side: seg.side,
    totalSides: sidesOf(timeline, seg.exerciseIndex),
    phase: seg.kind,
    remainingMs: seg.startMs + seg.durationMs - elapsed,
    segmentMs: seg.durationMs,
  }
}
